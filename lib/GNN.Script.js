import System;
import System.IO;
import System.Reflection;
import System.CodeDom.Compiler;
import System.Runtime.InteropServices;
import Microsoft.CSharp;
import Microsoft.JScript;

package GNN {
    class Source {
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

        static function resolvePath(sourceFile, file) {
            if (Path.IsPathRooted(file)) return file;
            var dir = Path.GetDirectoryName(sourceFile);
            return Path.Combine(dir, file);
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

    class Script extends MarshalByRefObject {
        var cp : CompilerParameters;
        var options = {};
        var dir;
        var assemblies = {};

        function Script() {
            this.cp = new CompilerParameters();

            // default behaviour is to compile an executable in memory
            cp.GenerateInMemory = true;
            cp.GenerateExecutable = true;

            // default library path
            var path = Assembly.GetEntryAssembly().Location;
            this.dir = Path.GetDirectoryName(path);
            path = '"' + dir + '"';
            this.options.lib = [
                path,
                RuntimeEnvironment.GetRuntimeDirectory()
            ].join(';');
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
                'System.Drawing.dll'
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

        static class Translation {
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
                            return new Source(file);
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
        : CompilerResults {
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

            return res;
        }

        function compile(file : String, provider : CodeDomProvider)
        : CompilerResults {
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

    class ScriptRunner {
        var options;

        function ScriptRunner(options) {
            this.options = options || {};
            this.options.err = this.options.err || Console.Error;
        }

        function run(fname, ...args : String[]) {
            var err = this.options.err;

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
            }

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

            if (provider instanceof CSharpCodeProvider) {
                script.options.optimize = !!this.options.optimize;
            } else if (provider instanceof JScriptCodeProvider) {
                script.options.fast = !!this.options.fast;
            }

            // compile
            var res = script.compile(fname, provider);
            if (0 < res.Errors.Count) {
                script.reportErrors(res.Errors, err);
                return;
            }

            // run
            var asm = res.CompiledAssembly;
            var method = asm.EntryPoint;
            method.Invoke(null, [args]);
        }
    }
}
