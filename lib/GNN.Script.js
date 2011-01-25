import System;
import System.IO;
import System.Reflection;
import System.CodeDom.Compiler;
import System.Runtime.InteropServices;
import Microsoft.CSharp;
import Microsoft.JScript;

package GNN {
    class Script extends MarshalByRefObject {
        var cp : CompilerParameters;
        var options = {};
        var result : CompilerResults;

        function Script() {
            this.cp = new CompilerParameters();

            // default behaviour is to compile an executable in memory
            cp.GenerateInMemory = true;
            cp.GenerateExecutable = true;

            // default library path
            var path = Assembly.GetEntryAssembly().Location;
            path = '"' + Path.GetDirectoryName(path) + '"';
            this.options.lib = [
                path,
                RuntimeEnvironment.GetRuntimeDirectory()
            ].join(';');
        }

        function importAssemblies(names) {
            if (!(names instanceof Array)) names = [names];
            for (var i=0; i < names.length; i++) {
                this.cp.ReferencedAssemblies.Add(names[i]);
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

        function compileFromSource(source : String, provider : CodeDomProvider)
        : CompilerResults {
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

            // this works with /lib:C:\\Users\\tarao\\work\\vmware\\build\\ :
            // cp.ReferencedAssemblies.Add('Wnd.dll');
            //
            // TODO: support notation of
            //   import Wnd in "lib/Wnd.dll" // JScript
            //   using Wnd in "lib/Wnd.dll"  // C#
            // by copying script.net.exe and lib/Wnd.dll to the same directory,
            // i.e., we have already added the directory of script.net.exe to
            // /lib, only we need is to copy DLL and add the full path of DLL
            // to ReferencedAssemblies. Note: we assume that script.net.exe is
            // located to appropriate place,
            // e.g. C:\Users\xxx\AppData\Local\Temp.

            // compile
            // TODO: error message
            source = [source];
            this.result = provider.CompileAssemblyFromSource(this.cp, source);
            return this.result;
        }

        function compile(file : String, provider : CodeDomProvider)
        : CompilerResults {
            var source = File.ReadAllLines(file).join("\n");
            return this.compileFromSource(source, provider);
        }

        function reportErrors(w : TextWriter){
            if (!this.result || !this.result.Errors) return;
            for (var i=0; i < this.result.Errors.Count; i++) {
                w.WriteLine(this.result.Errors[i].ToString());
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
                script.importAssemblies('GNN.Script.dll');
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

            // compile
            var res = script.compile(fname, provider);
            if (0 < res.Errors.Count) {
                script.reportErrors(err);
                return;
            }

            // run
            var asm = res.CompiledAssembly;
            var method = asm.EntryPoint;
            method.Invoke(null, [args]);
        }
    }
}
