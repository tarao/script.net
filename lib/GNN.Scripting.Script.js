import System;
import System.IO;
import System.Reflection;
import System.CodeDom.Compiler;
import System.Runtime.InteropServices;
import Microsoft.JScript;

package GNN.Scripting {
    class Source {
        static function fromString(str : String) : Source {
            return new Source(str.split(/\n/));
        }

        static function resolvePath(sourceFile : String, file : String)
        : String {
            if (Path.IsPathRooted(file)) return file;
            var dir : String = Path.GetDirectoryName(sourceFile);
            return Path.Combine(dir, file);
        }

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

        var lines : Array = [];
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

            function runtimeError(err : Error) : void {
                var e : Exception = ErrorObject.ToException(err);
                if (e.InnerException) e = e.InnerException;
                if (e.StackTrace) {
                    var trace : Array = e.StackTrace.split(/\r?\n/);
                    if (e.Message != trace[0]) {
                        trace.unshift(e.Message);
                    }
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
                    throw new Exception(trace.join("\n"));
                } else {
                    throw new Exception(e+'');
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
            var asm : System.Reflection.Assembly;
            asm = System.Reflection.Assembly.GetEntryAssembly();
            if (!asm) asm = System.Reflection.Assembly.GetExecutingAssembly();
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
                'GNN.Scripting.Impl.dll',
                'GNN.Scripting.Script.dll',
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

        function compileFromSource(source : Source, provider : CodeDomProvider)
        : Compiled {
            // source translation
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
            if (this.options.target == 'library') {
                this.cp.GenerateExecutable = false;
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

        static function compileError(errs : CompilerErrorCollection)
        : void {
            var msgs : Array = [];
            for (var i : int = 0; i < errs.Count; i++) {
                msgs.push(errs[i].ToString());
            }
            throw new Exception(msgs.join("\n"));
        }
    }
}
