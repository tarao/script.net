import System;
import System.IO;
import System.Data;
import System.Reflection;
import System.CodeDom.Compiler;
import System.Runtime.InteropServices;
import Microsoft.CSharp;
import Microsoft.JScript;

package GNN.Scripting {
    class Source {
        static function resolvePath(sourceFile, file) {
            if (Path.IsPathRooted(file)) return file;
            var dir = Path.GetDirectoryName(sourceFile);
            return Path.Combine(dir, file);
        }

        var lines = [];

        function Source(file) {
            var lines = file;
            if (file && typeof file == 'string') {
                lines = File.ReadAllLines(file);
            } else {
                file = null;
            }
            for (var i=0; i < lines.length; i++) {
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

        function code(i : int) {
            return this.lines[i].code;
        }

        function meta(i : int) {
            var line = this.lines[i];
            if (!line) return null;
            return { file: line.file, line: line.line };
        }

        function map(func) {
            for (var i=0; i < this.lines.length; i++) {
                var line = this.lines[i];
                if (!(line instanceof Source)) line = func(line);
                if (line instanceof Source) {
                    line = line.map(func);
                }
                this.lines[i] = line;
            }
            return this;
        }

        function flatten() {
            var result = [];
            for (var i=0; i < this.lines.length; i++) {
                var line = (this.lines[i] instanceof Source) ?
                        this.lines[i].flatten().lines : [ this.lines[i] ];
                result = result.concat(line);
            }
            this.lines = result;
            return this;
        }

        function toString() {
            var result = [];
            for (var i=0; i < this.lines.length; i++) {
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

            function reportError(e, w : TextWriter) {
                e = ErrorObject.ToException(e);
                if (e.InnerException) e = e.InnerException;
                if (e.StackTrace) {
                    var trace = e.StackTrace.split(/\r?\n/);
                    var file = this.result.TempFiles.BasePath;
                    var regex = file+"[^:]*:(.*?)([0-9]+)";
                    regex = regex.replace(/\\/g, "\\\\");
                    regex = new RegExp(regex, 'i');

                    for (var i=0; i < trace.length; i++) {
                        var m = regex.exec(trace[i]);
                        if (m) {
                            var text = m[1];
                            var line = parseInt(m[2]);
                            var meta = this.source.meta(line-1);
                            if (meta && meta.file) {
                                text = meta.file+':'+text+meta.line;
                                trace[i] = trace[i].replace(regex, text);
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
                var message;
                var meta;
                function Error(message, meta) {
                    this.message = message;
                    this.meta = meta;
                }
            }

            static class Include {
                function translate(source : Source) : Source {
                    var r = /^@include\s*['"](.*)['"](?:\s*;\s*)?$/;
                    return source.map(function(line) {
                        var m = r.exec(line.code);
                        if (m) {
                            var file = m[1];
                            if (line.file) {
                                file = Source.resolvePath(line.file, file);
                            }
                            var src = null;
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
                var parent;

                function Import(parent) {
                    this.parent = parent;
                }

                function translate(source : Source) : Source {
                    var r = "^(import|using)\\s+([^\\s]+)";
                    r += "(?:\\s+in\\s*['\"](.+)['\"])?\\s*;\s*$";
                    r = new RegExp(r);
                    return source.map(function(line) {
                        var m = r.exec(line.code);
                        if (m && m[3]) {
                            line.code = m[1]+' '+m[2]+';';
                            var file = m[3];
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
                var parent;

                function Link(parent) {
                    this.parent = parent;
                }

                function translate(source : Source) : Source {
                    var r = /^@link\s*['"](.*)['"](?:\s*;\s*)?$/;
                    return source.map(function(line) {
                        var m = r.exec(line.code);
                        if (m) {
                            line.code = '';
                            var file = m[1];
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
        var options = {};
        var dir;
        var assemblies = {};

        function Script() {
            this.cp = new CompilerParameters();

            // default behaviour is to compile an executable in memory
            this.cp.GenerateInMemory = true;
            this.cp.GenerateExecutable = true;

            // default library path
            var lib = [ RuntimeEnvironment.GetRuntimeDirectory() ];
            var asm = Assembly.GetEntryAssembly();
            if (!asm) asm = Assembly.GetExecutingAssembly();
            if (asm) {
                var path = asm.Location;
                this.dir = Path.GetDirectoryName(path);
                lib.unshift('"'+dir+'"');
            }
            this.options.lib = lib.join(';');
        }

        function importAssemblies(names) {
            if (!(names instanceof Array)) names = [names];
            for (var i=0; i < names.length; i++) {
                if (!this.assemblies[names[i]]) {
                    this.cp.ReferencedAssemblies.Add(names[i]);
                    this.assemblies[names[i]] = true;
                }
            }
            return names;
        }

        function importLocalAssemblies(names) {
            if (!(names instanceof Array)) names = [names];
            if (!this.dir) return;
            for (var i=0; i < names.length; i++) {
                var fname = Path.GetFileName(names[i]);
                var dst = Path.Combine(this.dir, fname);
                var t1 = File.GetLastWriteTimeUtc(names[i]);
                var t2 = File.GetLastWriteTimeUtc(dst);
                if (File.Exists(names[i]) && (!File.Exists(dst) || t1 > t2)) {
                    File.Copy(names[i], dst, true);
                }
                this.importAssemblies(fname);
            }
            return names;
        }

        function importStandardAssemblies() {
            return this.importAssemblies([
                'Accessibility.dll',
                'System.dll',
                'System.Drawing.dll',
                'System.Windows.Forms.dll',
                'mscorlib.dll'
            ]);
        }

        function importSelf() {
            return this.importAssemblies([
                'GNN.Scripting.dll',
                'Microsoft.JScript.dll'
            ]);
        }

        function importConfiguredAssemblies() {
            var getRuntimeDir = function() {
                var runtime = RuntimeEnvironment.GetRuntimeDirectory();
                var regex = new RegExp('\\'+Path.DirectorySeparatorChar+'$');
                if (regex.test(runtime)) {
                    runtime = runtime.substring(0, runtime.length-1);
                }
                return runtime;
            };
            var findCompilerConfiguration = function() {
                var runtime = getRuntimeDir();
                var current = Path.GetFileName(runtime);
                var parent = Path.GetDirectoryName(runtime);
                var dirs = Directory.GetDirectories(parent);
                var skip = true;
                var path;
                for (var i=dirs.length-1; 0 <= i; i--) {
                    if (Path.GetFileName(dirs[i]) == current) skip = false;
                    path = Path.Combine(dirs[i], 'csc.rsp');
                    if (!skip && File.Exists(path)) return path
                }
            };
            var getImportsFromCompilerConfiguration = function() {
                var names = [];
                var rsp = findCompilerConfiguration();
                if (rsp) {
                    var runtime = getRuntimeDir();
                    var lines = File.ReadAllLines(rsp);
                    for (var i=0; i < lines.length; i++) {
                        var m = new RegExp('^/r:(.*)$').exec(lines[i]);
                        if (m && File.Exists(Path.Combine(runtime, m[1]))) {
                            names.push(m[1]);
                        }
                    }
                }
                return names;
            };

            var imports = getImportsFromCompilerConfiguration();
            return this.importAssemblies(imports);
        }


        function translate(source : Source) : Source {
            var translators = [
                new Translation.Include(),
                new Translation.Import(this),
                new Translation.Link(this)
            ];
            for (var i=0; i < translators.length; i++) {
                source = translators[i].translate(source);
            }
            return source;
        }

        function compileFromSource(source, provider : CodeDomProvider)
        : Compiled {
            // read source
            if (typeof source == 'string') {
                source = new Source(source.split(/\n/));
            } else if (!(source instanceof Source)) {
                source = new Source(source);
            }
            source = this.translate(source);

            // set compiler options
            var opt = [];
            for (var prop in this.options) {
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

            // compile
            source = this.translate(source).flatten();
            var text : String[] = [source.toString()];
            var res = provider.CompileAssemblyFromSource(this.cp, text);

            // manipulate compile error
            for (var i=0; i < res.Errors.Count; i++) {
                var err = res.Errors[i];
                var meta = source.meta(err.Line-1);
                if (meta && meta.file) {
                    err.Line = meta.line;
                    err.FileName = meta.file;
                }
            }

            return new Compiled(source, res);
        }

        function compile(file : String, provider : CodeDomProvider)
        : Compiled {
            var source = new Source(file);
            return this.compileFromSource(source, provider);
        }

        function reportErrors(errs : CompilerErrorCollection, w : TextWriter){
            for (var i=0; i < errs.Count; i++) {
                w.WriteLine(errs[i].ToString());
            }
            return;
        }
    }

    class RunnerImpl extends MarshalByRefObject {
        var options = {};
        var cache = {};

        function setOption(key, value) {
            this.options[key] = value;
        }

        function compile(fname : String) {
            var err = this.options.err || Console.Error;

            // select language
            var provider=null; var m;
            var lang = this.options.lang;
            if (lang) {
                if ('csharp'.indexOf(lang.toLowerCase()) == 0) {
                    provider = new CSharpCodeProvider();
                } else if ('jscript'.indexOf(lang.toLowerCase()) == 0) {
                    provider = new JScriptCodeProvider();
                }
                if (!provider) {
                    err.WriteLine('Unknown language "'+lang+'"');
                    return;
                }
            } else if (/\.cs$/.test(fname)) {
                provider = new CSharpCodeProvider();
            } else {
                provider = new JScriptCodeProvider();
            }

            var script = new Script();
            if (this.options.target) {
                script.options.target = this.options.target;
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

                if (0 < compiled.result.Errors.Count) {
                    // compilation failed
                    script.reportErrors(compiled.result.Errors, err);
                } else {
                    this.cache[fname] = compiled;
                    return true;
                }
            } catch (e) {
                // script.compile() failed
                if (e instanceof Script.Translation.Error) {
                    var loc = [ e.meta.line, e.meta.col||1 ].join(',');
                    var msg = e.meta.file+'('+loc+')'+': '+e.message;
                    err.WriteLine(msg);
                } else {
                    err.WriteLine(e);
                }
            }
        }

        function run(fname : String, ...args : String[]) {
            var err = this.options.err || Console.Error;
            if (!this.cache[fname] && !this.compile(fname)) return;
            var compiled : Script.Compiled = this.cache[fname];

            // run
            try {
                var asm = compiled.result.CompiledAssembly;
                var method = asm.EntryPoint;
                method.Invoke(null, [args]);
            } catch (e) {
                // script evaluation failed
                compiled.reportError(e, err);
            }
        }

        function getFiles() : PropertyCollection {
            var col : PropertyCollection = new PropertyCollection();
            for (var file in this.cache) {
                var files = this.cache[file].result.TempFiles;
                if (files) col.Add(file, files.BasePath);
            }
            return col;
        }
    }

    class Runner {
        var app;
        var runner;

        static function newDomain() {
            var rand = new Random();
            var dom = '';
            for (var i=0; i < 8; i++) {
                dom += rand.Next(16).toString(16);
            }
            return dom;
        }

        static function run(options, fname, ...args : String[]) {
            var runner = new Runner(options);
            runner.run.apply(runner, [ fname ].concat(args));
            runner.clean();
        }

        function Runner(options) {
            this.app = AppDomain.CreateDomain(newDomain());
            var file = "GNN.Scripting";
            var name = "GNN.Scripting.RunnerImpl";
            this.runner = app.CreateInstanceAndUnwrap(file, name);
            for (var prop in options) this.setOption(prop, options[prop]);
        }

        function setOption(key, value) {
            this.runner.setOption(key, value);
        }

        function compile(fname : String) {
            return this.runner.compile(fname);
        }

        function run(fname : String, ...args : String[]) {
            return this.runner.run.apply(this.runner, [ fname ].concat(args));
        }

        function clean() {
            var col : PropertyCollection = this.runner.getFiles();
            AppDomain.Unload(this.app);

            var e = col.GetEnumerator();
            var exts = [ '.exe', '.dll', '.pdb' ];
            while (e.MoveNext()) {
                for (var i=0; i < exts.length; i++) {
                    var file = e.Value+exts[i];
                    if (File.Exists(file)) File.Delete(file);
                }
            }
        }
    }
}
