import GNN.Scripting;
import GNN.Scripting.Reflection;
import GNN.Scripting.Impl;
import GNN.Scripting.Compiler;
import GNN.Scripting.Preprocessor;
import GNN.Scripting.Cache;
import GNN.Scripting.Script;
import System;
import System.IO;
import System.Collections;
import System.Reflection;
import System.CodeDom.Compiler;
import Microsoft.CSharp;
import Microsoft.JScript;

package GNN.Scripting {
    public class FatalError extends Exception {
        function FatalError(msg : String) {
            super(msg);
        }
    }

    public class CompileError extends Exception {
        function CompileError(msg : String) {
            super(msg);
        }
    }

    public class RuntimeError extends Exception {
        function RuntimeError(msg : String) {
            super(msg);
        }
    }
}

package GNN.Scripting.Reflection {
    class Assembly {
        static function fromSource(source : String, options : Object)
        : Assembly {
            var asm = new Assembly(source, options);
            asm.source = true;
            return asm;
        }

        function Assembly(input : String, options : Object) {
            this.input = input;
            this.source = false;
            this.options = options || {};
        }

        function load() : Assembly {
            this.unload();

            var o : Object = {};
            for (var prop : String in this.options) {
                o[prop] = this.options[prop];
            }
            if (o.out) {
                o.cache = null;
            } else if (o.cache || (o.cache != false && !this.source)) {
                var hash = Util.hash(this.input);
                hash = (this.source ? 'eval_' : 'run_') + hash;
                var file = Path.Combine(Util.assemblyDir(), hash);
                o.cache = new Cache(file+'.cache');
                o.out = file+'.dll';
            }
            if (!o.cache && o.debug) o.domain = 'separate';

            var man : Manager = (options.domain == 'separate') ?
                    new AppDomainManager(o) : new Manager(o);
            try {
                if (this.source) {
                    man.runner.compileFromSource(this.input);
                } else {
                    man.runner.compileFromFile(this.input);
                }
                this.man = man;
                return this;
            } catch (e) {
                man.clean();
                RunnerImpl.parseCompileError(e);
            }
        }

        function unload() : void {
            if (this.man) {
                this.man.clean()
                this.man = null;
            }
        }

        function get loaded() : boolean {
            return !!this.man;
        }

        function get warned() : boolean {
            return !!this.man.runner.warnings;
        }

        function get warnings() : String[] {
            return this.man.runner.warnings;
        }

        function run(...args : String[]) {
            if (this.loaded) {
                var cmd : String[] = this.source ?
                        args : [ this.input ].concat(args);
                try {
                    return this.man.runner.run(cmd);
                } catch (e) {
                    RunnerImpl.parseRuntimeError(e);
                }
            }
        }

        function klass(name : String) : Class {
            if (this.loaded) return new Class(name, this.man.runner);
            return null;
        }

        private var input : String;
        private var source : boolean;
        private var options : Object;
        private var man : Manager;

        private static class Manager {
            function create() : RunnerImpl {
                return new RunnerImpl();
            }

            function Manager(options : Object) {
                this.runner = this.create();
                for (var prop : String in options) {
                    this.setOption(prop, options[prop]);
                }
            }

            function setOption(key : String, value) : void {
                this.runner.setOption(key, value);
            }

            function clean() : void {
                // do nothing
            }

            var runner : RunnerImpl;
        }

        private static class AppDomainManager extends Manager {
            static function newDomain() : String {
                var rand : Random = new Random();
                var dom : String = '';
                for (var i : int = 0; i < 8; i++) {
                    dom = dom + rand.Next(16).toString(16);
                }
                return dom;
            }

            function AppDomainManager(options : Object) {
                super(options);
            }

            override function create() : RunnerImpl {
                this.domain = AppDomain.CreateDomain(newDomain());
                var file : String = "GNN.Scripting.Impl";
                var name : String = "GNN.Scripting.Impl.RunnerImpl";
                return this.domain.CreateInstanceAndUnwrap(file, name);
            }

            override function clean() : void {
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

            var domain : AppDomain;
        }
    }
}

package GNN.Scripting.Impl {
    class CompiledCache extends Compiler.Compiled {
        function CompiledCache(file : String) {
            try {
                this.asm_ = System.Reflection.Assembly.LoadFrom(file);
            } catch (e) {
                // ignore
            }
        }

        function get asm() : System.Reflection.Assembly {
            return this.asm_;
        }

        var asm_ : System.Reflection.Assembly;
    }

    class RunnerImpl extends MarshalByRefObject implements Impl {
        private static function fatalError(msg : String) : void {
            throw new InvalidOperationException(msg);
        }

        static function parseFatalError(err : Error) : void {
            var e : Exception = ErrorObject.ToException(err);
            if (e instanceof InvalidOperationException) {
                throw new FatalError(e.Message);
            }
        }

        static function parseCompileError(err : Error) : void {
            parseFatalError(err);
            var e : Exception = ErrorObject.ToException(err);
            throw new CompileError(e.Message);
        }

        static function parseRuntimeError(err : Error) : void {
            parseFatalError(err);
            var e : Exception = ErrorObject.ToException(err);
            throw new RuntimeError(e.Message);
        }

        static function getTypes(params : Object[]) : Type[] {
            var types : Type[] = new Type[params.length];
            for (var i : int = 0; i < params.length; i++) {
                types[i] = params[i].GetType();
            }
            return types;
        }

        function setOption(key : String, value) : void {
            this.options[key] = value;
        }

        function get codeProvider() : CodeDomProvider {
            var provider : CodeDomProvider = null;
            if (this.options.lang) {
                var lang : String = this.options.lang;
                if ('csharp'.indexOf(lang.toLowerCase()) == 0) {
                    provider = new CSharpCodeProvider();
                } else if ('jscript'.indexOf(lang.toLowerCase()) == 0) {
                    provider = new JScriptCodeProvider();
                }
                if (!provider) {
                    fatalError('unknown language "'+lang+'".');
                    return;
                }
            } else {
                provider = new JScriptCodeProvider();
            }
            return provider;
        }

        function compileFromFile(fname : String) : void {
            if (!this.options.lang && /\.cs$/.test(fname)) {
                this.options.lang = 'csharp';
            }
            var src : Source = null;
            try {
                this.compile(Source.fromFile(fname));
                src = Source.fromFile(fname);
            } catch (e) {
                throw new Exception(e+'');
            }
        }

        function compileFromSource(source : String) : void {
            this.compile(Source.fromString(source));
        }

        function compile(source : Source) : void {
            var provider : CodeDomProvider = this.codeProvider;
            var script : Compiler = new Compiler();

            if (this.options.target) {
                script.options.target = this.options.target;
            }
            if (this.options.out) {
                script.options.out = this.options.out;
            }

            // import assemblies
            if (this.options['import'] == 'none') {
            } else if (this.options['import'] == 'standard') {
                script.p.importStandardAssemblies();
            } else {
                script.p.importConfiguredAssemblies();
                script.p.importSelf();
            }
            if (this.options.autoref &&
                provider instanceof JScriptCodeProvider) {
                script.options.autoref = true;
            }

            if (this.options.optimize) this.options.fast = true;
            if (provider instanceof CSharpCodeProvider) {
                script.options.optimize = !!this.options.fast;
                if (this.options.debug) script.options.debug = 'pdbonly';
            } else if (provider instanceof JScriptCodeProvider) {
                script.options.fast = !!this.options.fast;
                if (this.options.debug) script.options.debug = true;
            }

            // preprocess
            var preprocessor : Translator = this.options.preprocessor;
            try {
                if (!preprocessor) {
                    var context = script.context(provider);
                    var f : Factory = this.options.preprocessorFactory;
                    if (!f) f = new DefaultFactory();
                    preprocessor = f.create(context);
                }
                source = preprocessor.source(source).toSource();
            } catch (e) {
                if (e instanceof GNN.Scripting.Preprocessor.Error) {
                    var loc : String = [e.meta.line, 1].join(',');
                    var msg : String = e.meta.file+'('+loc+')'+': '+e.message;
                    throw new Exception(msg);
                } else {
                    throw new Exception(e+'');
                }
            }

            var compiled : Compiler.Compiled = null;

            // lookup cache
            if (this.options.cache) {
                var cache : Cache = this.options.cache;
                if (cache.update(source.toString(), this.options)) {
                    if (File.Exists(this.options.out)) {
                        File.Delete(this.options.out);
                    }
                } else if (File.Exists(cache.file) &&
                           File.Exists(this.options.out)) {
                    compiled = new CompiledCache(this.options.out);
                    if (compiled.asm) {
                        this.compiled = compiled;
                        return; // no need to compile
                    }
                }
            }

            // compile
            try {
                compiled = script.compileFromSource(source, provider);
            } catch (e) {
                throw new Exception(e+'');
            }
            this.compiled = compiled;

            if (compiled.failed) {
                // compilation failed
                compiled.compileError(); // throws
            } else if (compiled.warned) {
                this.warnings = compiled.warning();
            }
        }

        function run(args : String[]) {
            if (!this.requireAssembly()) return;

            // run
            try {
                var m : MethodInfo = this.asm.EntryPoint;
                if (m) return m.Invoke(null, [args]);
            } catch (e) {
                // script evaluation failed
                this.compiled.runtimeError(e); // throws
            }
        }

        function type(name : String) : Type {
            if (!this.requireAssembly()) return null;
            return this.asm.GetType(name);
        }

        function create(klass : String, params : Object[]) : int {
            var types : Type[] = getTypes(params);

            var k : Type = this.type(klass);
            var m : ConstructorInfo = k.GetConstructor(types);
            if (m) {
                try {
                    var obj : Object =  m.Invoke(params);
                    var id = obj.GetHashCode();
                    this.instances[id] = obj;
                    return id;
                } catch (e) {
                    this.compiled.runtimeError(e);
                }
            } else {
                throw new Exception('');
            }
        }

        function invoke(klass : String, method : String, params : Object[])
        : Object {
            // class method
            return this.invoke_(this.type(klass), null, method, params);
        }

        function invokeI(id : int, method : String, params : Object[])
        : Object {
            // instance method
            var r : Object = this.instances[id];
            if (!r) {
                fatalError('invalid instance.');
                return;
            }
            return this.invoke_(r.GetType(), r, method, params);
        }

        private function invoke_(k : Type, obj : Object, method : String,
                                 params : Object[]) {
            var types : Type[] = getTypes(params);

            var m : MethodInfo = k.GetMethod(method, types);
            if (m) {
                try {
                    return m.Invoke(obj, params);
                } catch (e) {
                    this.compiled.runtimeError(e);
                }
            } else {
                throw new Exception('');
            }
        }

        function getProp(id : int, prop : String, index : Object[])
        : Object {
            var r : Object = this.instances[id];
            if (!r) {
                fatalError('invalid instance.');
                return;
            }

            var k : Type = r.GetType();
            var p : PropertyInfo = k.GetProperty(prop);
            var f : FieldInfo = k.GetField(prop);
            if (p) {
                return p.GetValue(r, index.length==0 ? null:index);
            } else if (index.length == 0 && f) {
                return f.GetValue(r);
            } else {
                throw new Exception('');
            }
        }

        function setProp(id : int, prop : String, val : Object,
                         index : Object[]) : Object {
            var r : Object = this.instances[id];
            if (!r) {
                fatalError('invalid instance.');
                return;
            }

            var k : Type = r.GetType();
            var p : PropertyInfo = k.GetProperty(prop);
            var f : FieldInfo = k.GetField(prop);
            if (p) {
                return p.SetValue(r, val, index.length==0 ? null:index);
            } else if (index.length == 0 && f) {
                return f.SetValue(r, val);
            } else {
                throw new Exception('');
            }
        }

        function getTempFiles() : Hashtable {
            if (this.compiled) {
                var hash : Hashtable = new Hashtable();
                var files : TempFileCollection;
                files = this.compiled.tempFiles;
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

        var options : Object = {};
        var compiled : Compiler.Compiled = null;
        var instances : Object = {};
        var warnings : String[] = null;

        private function get asm() : System.Reflection.Assembly {
            return this.compiled.asm;
        }

        private function requireAssembly() : boolean {
            if (!this.compiled || this.compiled.failed) {
                fatalError('nothing compiled.');
                return false;
            }

            return !!this.asm;
        }
    }
}
