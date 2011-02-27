import GNN.Scripting.Script;
import GNN.Scripting.Preprocessor;
import System;
import System.IO;
import System.Collections;
import System.Reflection;
import System.CodeDom.Compiler;
import System.Runtime.InteropServices;
import Microsoft.CSharp;
import Microsoft.JScript;

package GNN.Scripting {
    class Param implements Importer {
        function Param() {
            this.cp = new CompilerParameters();
            this.assemblies = new Hashtable();

            // default behaviour is to compile an executable in memory
            this.cp.GenerateInMemory = true;
            this.cp.GenerateExecutable = true;
        }

        function get dir() : String {
            if (this.dir_) return this.dir_;

            var asm : System.Reflection.Assembly;
            asm = System.Reflection.Assembly.GetEntryAssembly();
            if (!asm) asm = System.Reflection.Assembly.GetExecutingAssembly();
            if (asm) {
                var path : String = asm.Location;
                this.dir_ = Path.GetDirectoryName(path);
                return this.dir_;
            }

            return null;
        }

        function importLocalAssembly(name : String) : void {
            this.importLocalAssemblies([ name ]);
        }

        function importAssemblies(names : String[]) : String[] {
            for (var i : int = 0; i < names.length; i++) {
                if (names[i] && !this.assemblies.Contains(names[i])) {
                    this.cp.ReferencedAssemblies.Add(names[i]);
                    this.assemblies.Add(names[i], true);
                }
            }
            return names;
        }

        function importLocalAssemblies(names : String[]) : String[] {
            if (!this.dir) return [];

            for (var i : int = 0; i < names.length; i++) {
                var fname : String = Path.GetFileName(names[i]);
                var dst : String = Path.Combine(this.dir, fname);
                var t1 : DateTime = File.GetLastWriteTimeUtc(names[i]);
                var t2 : DateTime = File.GetLastWriteTimeUtc(dst);
                if (File.Exists(names[i]) && (!File.Exists(dst) || t1 > t2)) {
                    File.Copy(names[i], dst, true);
                }
                this.importAssemblies([fname]);
            }
            return names;
        }

        function importStandardAssemblies() : String[] {
            return this.importAssemblies([
                'Accessibility.dll',
                'System.dll',
                'System.Drawing.dll',
                'System.Windows.Forms.dll',
                'mscorlib.dll'
            ]);
        }

        function importSelf() : String[] {
            return this.importAssemblies([
                'GNN.Scripting.dll',
                'GNN.Scripting.Impl.dll',
                'GNN.Scripting.Compiler.dll',
                'GNN.Scripting.Preprocessor.dll',
                'GNN.Scripting.Script.dll',
                'Microsoft.JScript.dll'
            ]);
        }

        function importConfiguredAssemblies() : String[] {
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
            function getImportsFromCompilerConfiguration() : String[] {
                var names : Array = [];
                var rsp : String = findCompilerConfiguration();
                if (rsp) {
                    var runtime : String = getRuntimeDir();
                    var lines : String[] = File.ReadAllLines(rsp);
                    for (var i : int = 0; i < lines.length; i++) {
                        var r : RegExp = new RegExp('^/r:(.*)$');
                        var m : RegExpMatch= r.exec(lines[i]);
                        if (m && File.Exists(Path.Combine(runtime, m[1]))) {
                            lines[i] = m[1];
                        } else {
                            lines[i] = null;
                        }
                    }
                    return lines;
                }
                return [];
            }

            var imports : String[] = getImportsFromCompilerConfiguration();
            return this.importAssemblies(imports);
        }

        var cp : CompilerParameters;
        var assemblies : IDictionary = null;
        var dir_ : String = null;
    }

    class Compiler {
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
                    throw new Exception(trace.join("\n"));
                } else {
                    throw new Exception(e+'');
                }
            }
        }

        function Compiler() {
            this.p = new Param();

            // default library path
            var lib : Array = [ RuntimeEnvironment.GetRuntimeDirectory() ];
            if (this.p.dir) {
                lib.unshift('"'+this.p.dir+'"');
            }
            this.options.lib = lib.join(';');
        }

        function context(provider : CodeDomProvider) : Context {
            if (provider instanceof JScriptCodeProvider) {
                return new Context(new JScriptDirective(),
                                   new JScriptLineMarker(), this.p);
            } else if (provider instanceof CSharpCodeProvider) {
                return new Context(new CSharpDirective(),
                                   new CSharpLineMarker(), this.p);
            }
            return null;
        }

        function compileFromSource(source : Source, provider : CodeDomProvider)
        : Compiled {
            // set compiler options
            var opt : Array = [];
            for (var prop : String in this.options) {
                if (typeof this.options[prop] == 'boolean') {
                    opt.push('/'+prop+(this.options[prop] ? '+' : '-'));
                } else if (this.options[prop]) {
                    opt.push('/'+prop+':'+this.options[prop]);
                }
            }
            this.p.cp.CompilerOptions = opt.join(' ');

            // debug
            if (this.options.debug) {
                this.p.cp.GenerateInMemory = false;
            }

            // output file
            if (this.options.out) {
                this.p.cp.GenerateInMemory = false;
                this.p.cp.OutputAssembly = this.options.out;
            }
            if (this.options.target == 'library') {
                this.p.cp.GenerateExecutable = false;
            }

            // compile
            var text : String[] = [source.toString()];
            var res : CompilerResults;
            res = provider.CompileAssemblyFromSource(this.p.cp, text);

            return new Compiled(source, res);
        }

        function compile(file : String, provider : CodeDomProvider)
        : Compiled {
            var source : Source = Source.fromFile(file);
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

        var p : Param;
        var options : Object = {};
        var dir : String;
    }
}
