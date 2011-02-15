import System;
import System.IO;
import System.Collections;
import System.Reflection;
import System.CodeDom.Compiler;
import System.Runtime.InteropServices;
import Microsoft.CSharp;
import Microsoft.JScript;

package GNN.Scripting {
    class Source {
        static function resolvePath(sourceFile : String, file : String)
        : String {
            if (Path.IsPathRooted(file)) return file;
            var dir : String = Path.GetDirectoryName(sourceFile);
            return Path.Combine(dir, file);
        }

        var lines : Array = [];

        function Source(file) {
            var lines : Array;
            if (file && typeof file == 'string') {
                lines = File.ReadAllLines(file);
            } else {
                lines = file;
                file = null;
            }
            for (var i : int = 0; i < lines.length; i++) {
                this.lines.push({
                    file: file,
                    line: i+1,
                    code: lines[i]
                });
            }
        }

        function get length() : int {
            return this.lines.length;
        }

        function code(i : int) : String {
            return this.lines[i].code;
        }

        function meta(i : int) : Object {
            var line = this.lines[i];
            if (!line) return null;
            return { file: line.file, line: line.line };
        }

        function map(func : Function) : Source {
            for (var i : int = 0; i < this.lines.length; i++) {
                var line = this.lines[i];
                if (!(line instanceof Source)) line = func(line);
                if (line instanceof Source) {
                    line = line.map(func);
                }
                this.lines[i] = line;
            }
            return this;
        }

        function flatten() : Source {
            var result : Array = [];
            for (var i : int = 0; i < this.lines.length; i++) {
                var line = (this.lines[i] instanceof Source) ?
                        this.lines[i].flatten().lines : [ this.lines[i] ];
                result = result.concat(line);
            }
            this.lines = result;
            return this;
        }

        function toString() : String {
            var result : Array = [];
            for (var i : int = 0; i < this.lines.length; i++) {
                result.push((this.lines[i] instanceof Source) ?
                            this.lines[i].toString() : this.lines[i].code);
            }
            return result.join("\n");
        }
    }

    class Script {
        static class Compiled {
            var source : Source;
            var result : CompilerResults;

            function Compiled(source : Source, result : CompilerResults) {
                this.source = source;
                this.result = result;
            }

            function get failed() : boolean {
                return 0 < this.result.Errors.Count;
            }

            function reportError(err : Error, w : TextWriter) : void {
                var e : Exception = ErrorObject.ToException(err);
                if (e.InnerException) e = e.InnerException;
                if (e.StackTrace) {
                    var trace : Array = e.StackTrace.split(/\r?\n/);
                    var file : String = this.result.TempFiles.BasePath;
                    var regex : String = file+'[^:]*:(.*?)([0-9]+)';
                    regex = regex.replace(/\\/g, "\\\\");
                    var r : RegExp = new RegExp(regex, 'i');

                    for (var i : int = 0; i < trace.length; i++) {
                        var m : RegExpMatch = r.exec(trace[i]);
                        if (m) {
                            var text : String = m[1];
                            var line : int = parseInt(m[2]);
                            var meta : Object = this.source.meta(line-1);
                            if (meta && meta.file) {
                                text = meta.file+':'+text+meta.line;
                                trace[i] = trace[i].replace(r, text);
                            }
                        }
                    }
                    w.WriteLine(trace.join("\n"));
                } else {
                    w.WriteLine(e);
                }
            }
        }

        static class Translation {
            static class Error {
                var message : String;
                var meta : Object;

                function Error(message : String, meta : Object) {
                    this.message = message;
                    this.meta = meta;
                }
            }

            static class Include {
                function translate(source : Source) : Source {
                    var r : RegExp = /^@include\s*['"](.*)['"](?:\s*;\s*)?$/;
                    return source.map(function(line : Object) : Object {
                        var m : RegExpMatch = r.exec(line.code);
                        if (m) {
                            var file : String = m[1];
                            if (line.file) {
                                file = Source.resolvePath(line.file, file);
                            }
                            var src : Source = null;
                            try {
                                src = new Source(file);
                            } catch (e) {
                                throw new Error(e.message, line);
                            }
                            return src;
                        }
                        return line;
                    });
                }
            }

            static class Import {
                var parent : Script;

                function Import(parent : Script) {
                    this.parent = parent;
                }

                function translate(source : Source) : Source {
                    var regex : String = "^(import|using)\\s+([^\\s]+)" +
                            "(?:\\s+in\\s*['\"](.+)['\"])?\\s*;\s*$";
                    var r : RegExp = new RegExp(regex);
                    return source.map(function(line : Object) : Object {
                        var m : RegExpMatch = r.exec(line.code);
                        if (m && m[3]) {
                            line.code = m[1]+' '+m[2]+';';
                            var file : String = m[3];
                            if (line.file) {
                                file = Source.resolvePath(line.file, file);
                            }
                            parent.importLocalAssemblies(file);
                        }
                        return line;
                    });
                }
            }

            static class Link {
                var parent : Script;

                function Link(parent : Script) {
                    this.parent = parent;
                }

                function translate(source : Source) : Source {
                    var r : RegExp = /^@link\s*['"](.*)['"](?:\s*;\s*)?$/;
                    return source.map(function(line : Object) : Object {
                        var m : RegExpMatch = r.exec(line.code);
                        if (m) {
                            line.code = '';
                            var file : String = m[1];
                            if (line.file) {
                                file = Source.resolvePath(line.file, file);
                            }
                            parent.importLocalAssemblies(file);
                        }
                        return line;
                    });
                }
            }
        }

        var cp : CompilerParameters;
        var options : Object = {};
        var dir : String;
        var assemblies : Object = {};

        function Script() {
            this.cp = new CompilerParameters();

            // default behaviour is to compile an executable in memory
            this.cp.GenerateInMemory = true;
            this.cp.GenerateExecutable = true;

            // default library path
            var lib : Array = [ RuntimeEnvironment.GetRuntimeDirectory() ];
            var asm : Assembly = Assembly.GetEntryAssembly();
            if (!asm) asm = Assembly.GetExecutingAssembly();
            if (asm) {
                var path : String = asm.Location;
                this.dir = Path.GetDirectoryName(path);
                lib.unshift('"'+dir+'"');
            }
            this.options.lib = lib.join(';');
        }

        function importAssemblies(name) : Array {
            var names : Array;
            if (!(name instanceof Array)) {
                names = [name];
            } else {
                names = name;
            }
            for (var i : int = 0; i < names.length; i++) {
                if (!this.assemblies[names[i]]) {
                    this.cp.ReferencedAssemblies.Add(names[i]);
                    this.assemblies[names[i]] = true;
                }
            }
            return names;
        }

        function importLocalAssemblies(name) : Array {
            var names : Array;
            if (!(name instanceof Array)) {
                names = [name];
            } else {
                names = name;
            }
            if (!this.dir) return;
            for (var i : int = 0; i < names.length; i++) {
                var fname : String = Path.GetFileName(names[i]);
                var dst : String = Path.Combine(this.dir, fname);
                var t1 : DateTime = File.GetLastWriteTimeUtc(names[i]);
                var t2 : DateTime = File.GetLastWriteTimeUtc(dst);
                if (File.Exists(names[i]) && (!File.Exists(dst) || t1 > t2)) {
                    File.Copy(names[i], dst, true);
                }
                this.importAssemblies(fname);
            }
            return names;
        }

        function importStandardAssemblies() : Array {
            return this.importAssemblies([
                'Accessibility.dll',
                'System.dll',
                'System.Drawing.dll',
                'System.Windows.Forms.dll',
                'mscorlib.dll'
            ]);
        }

        function importSelf() : Array {
            return this.importAssemblies([
                'GNN.Scripting.dll',
                'Microsoft.JScript.dll'
            ]);
        }

        function importConfiguredAssemblies() : Array {
            function getRuntimeDir() : String {
                var rt : String = RuntimeEnvironment.GetRuntimeDirectory();
                var regex : String = '\\'+Path.DirectorySeparatorChar+'$';
                if (new RegExp(regex).test(rt)) {
                    rt = rt.substring(0, rt.length-1);
                }
                return rt;
            }
            function findCompilerConfiguration() : String {
                var runtime : String = getRuntimeDir();
                var current : String = Path.GetFileName(runtime);
                var parent : String = Path.GetDirectoryName(runtime);
                var dirs : Array = Directory.GetDirectories(parent);
                var skip : boolean = true;
                var path : String;
                for (var i : int = dirs.length-1; 0 <= i; i--) {
                    if (Path.GetFileName(dirs[i]) == current) skip = false;
                    path = Path.Combine(dirs[i], 'csc.rsp');
                    if (!skip && File.Exists(path)) return path
                }
                return null;
            }
            function getImportsFromCompilerConfiguration() : Array {
                var names : Array = [];
                var rsp : String = findCompilerConfiguration();
                if (rsp) {
                    var runtime : String = getRuntimeDir();
                    var lines : String[] = File.ReadAllLines(rsp);
                    for (var i : int = 0; i < lines.length; i++) {
                        var r : RegExp = new RegExp('^/r:(.*)$');
                        var m : RegExpMatch= r.exec(lines[i]);
                        if (m && File.Exists(Path.Combine(runtime, m[1]))) {
                            names.push(m[1]);
                        }
                    }
                }
                return names;
            }

            var imports : Array = getImportsFromCompilerConfiguration();
            return this.importAssemblies(imports);
        }


        function translate(source : Source) : Source {
            var translators : Array = [
                new Translation.Include(),
                new Translation.Import(this),
                new Translation.Link(this)
            ];
            for (var i : int = 0; i < translators.length; i++) {
                source = translators[i].translate(source);
            }
            return source;
        }

        function compileFromSource(input, provider : CodeDomProvider)
        : Compiled {
            // read source
            var source : Source
            if (typeof input == 'string') {
                source = new Source(input.split(/\n/));
            } else if (input instanceof Source) {
                source = input;
            } else {
                source = new Source(input);
            }
            source = this.translate(source);

            // set compiler options
            var opt : Array = [];
            for (var prop : String in this.options) {
                if (typeof this.options[prop] == 'boolean') {
                    opt.push('/'+prop+(this.options[prop] ? '+' : '-'));
                } else {
                    opt.push('/'+prop+':'+this.options[prop]);
                }
            }
            this.cp.CompilerOptions = opt.join(' ');

            // debug
            if (this.options.debug) {
                this.cp.GenerateInMemory = false;
            }

            // output file
            if (this.options.out) {
                this.cp.GenerateInMemory = false;
                this.cp.OutputAssembly = this.options.out;
            }

            // compile
            source = this.translate(source).flatten();
            var text : String[] = [source.toString()];
            var res : CompilerResults;
            res = provider.CompileAssemblyFromSource(this.cp, text);

            // manipulate compile error
            for (var i : int = 0; i < res.Errors.Count; i++) {
                var err : CompilerError = res.Errors[i];
                var meta : Object = source.meta(err.Line-1);
                if (meta && meta.file) {
                    err.Line = meta.line;
                    err.FileName = meta.file;
                }
            }

            return new Compiled(source, res);
        }

        function compile(file : String, provider : CodeDomProvider)
        : Compiled {
            var source : Source = new Source(file);
            return this.compileFromSource(source, provider);
        }

        function reportErrors(errs : CompilerErrorCollection, w : TextWriter)
        : void {
            for (var i : int = 0; i < errs.Count; i++) {
                w.WriteLine(errs[i].ToString());
            }
            return;
        }
    }

    class RunnerImpl extends MarshalByRefObject {
        static function fatalError(msg : String, w :TextWriter) : void {
            w.WriteLine('[GNN.Scripting.Runner] Error: '+msg);
        }

        var options : Object = {};
        var compiled : Script.Compiled = null;

        function setOption(key : String, value) : void {
            this.options[key] = value;
        }

        function compile(fname : String) : boolean {
            var err : TextWriter = this.options.err || Console.Error;

            // select language
            var provider : CodeDomProvider = null;
            if (this.options.lang) {
                var lang : String = this.options.lang;
                if ('csharp'.indexOf(lang.toLowerCase()) == 0) {
                    provider = new CSharpCodeProvider();
                } else if ('jscript'.indexOf(lang.toLowerCase()) == 0) {
                    provider = new JScriptCodeProvider();
                }
                if (!provider) {
                    fatalError('unknown language "'+lang+'"', err);
                    return false;
                }
            } else if (/\.cs$/.test(fname)) {
                provider = new CSharpCodeProvider();
            } else {
                provider = new JScriptCodeProvider();
            }

            var script : Script = new Script();
            if (this.options.target) {
                script.options.target = this.options.target;
            }
            if (this.options.out) {
                script.options.out = this.options.out;
            }

            // import assemblies
            if (this.options['import'] == 'none') {
            } else if (this.options['import'] == 'standard') {
                script.importStandardAssemblies();
            } else {
                script.importConfiguredAssemblies();
                script.importSelf();
            }

            if (provider instanceof CSharpCodeProvider) {
                script.options.optimize = !!this.options.optimize;
                if (this.options.debug) script.options.debug = 'pdbonly';
            } else if (provider instanceof JScriptCodeProvider) {
                script.options.fast = !!this.options.fast;
                if (this.options.debug) script.options.debug = true;
            }

            // compile
            try {
                var compiled : Script.Compiled;
                compiled = script.compile(fname, provider);
                this.compiled = compiled;

                if (compiled.failed) {
                    // compilation failed
                    script.reportErrors(compiled.result.Errors, err);
                } else {
                    return true;
                }
            } catch (e) {
                // script.compile() failed
                if (e instanceof Script.Translation.Error) {
                    var loc : String = [e.meta.line, e.meta.col||1].join(',');
                    var msg : String = e.meta.file+'('+loc+')'+': '+e.message;
                    err.WriteLine(msg);
                } else {
                    err.WriteLine(e);
                }
            }
            return false;
        }

        function run(...args : String[]) {
            var err : TextWriter = this.options.err || Console.Error;

            if (!this.compiled || this.compiled.failed) {
                fatalError('nothing compiled', err);
                return;
            }

            // run
            try {
                var asm : Assembly = this.compiled.result.CompiledAssembly;
                var method : MethodInfo = asm.EntryPoint;
                return method.Invoke(null, [args]);
            } catch (e) {
                // script evaluation failed
                this.compiled.reportError(e, err);
            }
        }

        function getTempFiles() : Hashtable {
            if (this.compiled) {
                var hash : Hashtable = new Hashtable();
                var files : TempFileCollection;
                files = this.compiled.result.TempFiles;
                if (files) {
                    hash.Add('base', files.BasePath);
                    var list : ArrayList = new ArrayList();
                    var e : IEnumerator = files.GetEnumerator();
                    while (e.MoveNext()) list.Add(e.Current);
                    hash.Add('files', list);
                    return hash;
                }
            }
            return null;
        }
    }

    class Runner implements IDisposable {
        static class App {
            static function newDomain() : String {
                var rand : Random = new Random();
                var dom : String = '';
                for (var i : int = 0; i < 8; i++) {
                    dom = dom + rand.Next(16).toString(16);
                }
                return dom;
            }

            var domain : AppDomain;
            var runner : RunnerImpl;

            function App(options : Object) {
                this.domain = AppDomain.CreateDomain(newDomain());
                var file : String = "GNN.Scripting";
                var name : String = "GNN.Scripting.RunnerImpl";
                this.runner = this.domain.CreateInstanceAndUnwrap(file, name);
                for (var prop : String in options) {
                    this.setOption(prop, options[prop]);
                }
            }

            function setOption(key : String, value) : void {
                this.runner.setOption(key, value);
            }

            function compile(fname : String) : boolean {
                return this.runner.compile(fname);
            }

            function run(fname : String, args : String[]) {
                var cmd : Array = [ fname ].concat(args);
                return this.runner.run.apply(this.runner, cmd);
            }

            function clean() : void {
                if (!this.runner || !this.domain) return;
                var hash : Hashtable = this.runner.getTempFiles();

                try {
                    AppDomain.Unload(this.domain);
                } catch (e) {
                    // ignore: CannotUnloadAppDomainException
                }

                if (!hash) return;

                var base : String = hash['base'];
                var files : ArrayList = hash['files'];
                var exts : String[] = [ '.pdb' ];

                var i : int;
                for (i=0; i < exts.length; i++) {
                    files.Add(base+exts[i]);
                }
                for (i=0; i < files.Count; i++) {
                    var file : String = files[i];
                    if (File.Exists(file)) File.Delete(file);
                }
            }
        }

        static class Cache {
            var fname : String;
            var options : Object;
            var app : App;

            function Cache(fname : String, options : Object) {
                this.fname = fname;
                this.options = options || {};
            }

            function load() : Cache {
                this.unload();
                var app : App = new App(this.options);
                if (app.compile(this.fname)) {
                    this.app = app;
                    return this;
                } else {
                    app.clean();
                    return null;
                }
            }

            function unload() : void {
                if (this.app) {
                    this.app.clean()
                    this.app = null;
                }
            }

            function get loaded() : boolean {
                return !!this.app;
            }
        }

        static function using(block : Function) {
            var runner : Runner = new Runner();
            try {
                return block(runner);
            } finally {
                runner.Dispose();
            }
        }

        static function run(options, fname : String, ...args : String[]) {
            return using(function(runner) {
                if (runner.load(fname, options)) {
                    return runner.run.apply(runner, [ fname ].concat(args));
                } else {
                    return -1;
                }
            });
        }

        static function getId(fname : String) : String {
            return Path.GetFullPath(fname);
        }

        var cache : Object = {};

        function load_(fname : String, options : Object) : Cache {
            var id : String = getId(fname);

            this.unloadById(id);
            var cache : Cache = new Cache(fname, options);
            this.cache[id] = cache;
            return cache.load();
        }

        function load(fname : String, options : Object) : boolean {
            return !!this.load_(fname, options);
        }

        function run(fname : String, ...args : String[]) {
            var id : String = getId(fname);
            var cache : Cache = this.cache[id] || this.load_(fname, null);
            if (cache && cache.loaded) return cache.app.run(fname, args);
        }

        function unload(fname : String) : void {
            this.unloadById(getId(fname));
        }

        function unloadById(id) : void {
            var cache : Cache = this.cache[id];
            if (cache) {
                cache.unload();
                delete this.cache[id];
            }
        }

        function unloadAll() : void {
            for (var id : String in this.cache) this.unloadById(id);
        }

        override function Dispose() : void {
            this.unloadAll();
        }
    }
}
