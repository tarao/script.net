import System;
import System.IO;
import System.Collections;
import System.Reflection;
import System.CodeDom.Compiler;
import Microsoft.CSharp;
import Microsoft.JScript;
import GNN.Scripting;
import GNN.Scripting.Reflection;
import GNN.Scripting.Impl;

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
            var app : App = new App(this.options);
            try {
                if (this.source) {
                    app.runner.compileFromSource(this.input);
                } else {
                    app.runner.compile(this.input);
                }
                this.app = app;
                return this;
            } catch (e) {
                app.clean();
                RunnerImpl.parseCompileError(e);
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

        function run(...args : String[]) {
            if (this.loaded) {
                var cmd : String[] = this.source ?
                        args : [ this.input ].concat(args);
                try {
                    return this.app.runner.run(cmd);
                } catch (e) {
                    RunnerImpl.parseRuntimeError(e);
                }
            }
        }

        function klass(name : String) : Class {
            if (this.loaded) return new Class(name, this.app.runner);
            return null;
        }

        private var input : String;
        private var source : boolean;
        private var options : Object;
        private var app : App;

        private static class App {
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
                var file : String = "GNN.Scripting.Impl";
                var name : String = "GNN.Scripting.Impl.RunnerImpl";
                this.runner = this.domain.CreateInstanceAndUnwrap(file, name);
                for (var prop : String in options) {
                    this.setOption(prop, options[prop]);
                }
            }

            function setOption(key : String, value) : void {
                this.runner.setOption(key, value);
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
    }

    class Class {
        function Class(name : String, runner : RunnerImpl) {
            this.name_ = name;
            this.runner = runner;
        }

        function get name() : String {
            return this.name_;
        }

        function create(...params : Object[]) : Instance {
            try {
                return this.runner.create(this.name, params);
            } catch (err) {
                var e : Exception = ErrorObject.ToException(err);
                var msg : String = e.Message;
                if (msg.length == 0) {
                    msg = [
                        'Invalid constructor',
                        "'" + this.name + "'",
                        'or invalid types of arguments.'
                    ].join(' ');
                    throw new RuntimeError(msg);
                } else {
                    RunnerImpl.parseRuntimeError(err);
                }
            }
        }

        function invoke(method : String, ...params : Object[]) {
            try {
                return this.runner.invoke(this.name, method, params);
            } catch (err) {
                var e : Exception = ErrorObject.ToException(err);
                var msg : String = e.Message;
                if (msg.length == 0) {
                    msg  = [
                        'Invalid method',
                        "'" + this.name + '.' + method + "'",
                        'or invalid types of arguments.'
                    ].join(' ');
                    throw new RuntimeError(msg);
                } else {
                    RunnerImpl.parseRuntimeError(err);
                }
            }
        }

        private var name_ : String;
        private var runner : RunnerImpl;
    }

    class Instance {
        function Instance(id : int, runner : RunnerImpl) {
            this.id_ = id;
            this.runner = runner;
        }

        function get id() : int {
            return this.id_;
        }

        function invoke(method : String, ...params : Object[]) {
            try {
                return this.runner.invokeI(this, method, params);
            } catch (err) {
                var e : Exception = ErrorObject.ToException(err);
                var msg : String = e.Message;
                if (msg.length == 0) {
                    msg = [
                        'Invalid method',
                        "'" + method + "'",
                        'or invalid types of arguments.'
                    ].join(' ');
                    throw new RuntimeError(msg);
                } else {
                    RunnerImpl.parseRuntimeError(err);
                }
            }
        }

        function getProp(prop : String, ...index : Object[]) {
            try {
                return this.runner.getProp(this, prop, index);
            } catch (err) {
                var e : Exception = ErrorObject.ToException(err);
                var msg : String = e.Message;
                if (msg.length == 0) {
                    msg = [
                        'Invalid property',
                        "'" + prop + "'",
                        'or invalid indices.'
                    ].join(' ');
                    throw new RuntimeError(msg);
                } else {
                    RunnerImpl.parseRuntimeError(err);
                }
            }
        }

        function setProp(prop : String, val : Object, ...index : Object[]) {
            try {
                return this.runner.setProp(this, prop, val, index);
            } catch (err) {
                var e : Exception = ErrorObject.ToException(err);
                var msg : String = e.Message;
                if (msg.length == 0) {
                    msg = [
                        'Invalid property',
                        "'" + prop + "'",
                        'or invalid indices',
                        'or invalid value.'
                    ].join(' ');
                    throw new RuntimeError(msg);
                } else {
                    RunnerImpl.parseRuntimeError(err);
                }
            }
        }

        function getItem(...index : Object[]) {
            return this.getProp('Item', index);
        }

        function setItem(val : Object, ...index : Object[]) {
            return this.setProp('Item', val, index);
        }

        private var id_ : int;
        private var runner : RunnerImpl;
    }
}

package GNN.Scripting.Impl {
    class RunnerImpl extends MarshalByRefObject {
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

        var options : Object = {};
        var compiled : Script.Compiled = null;
        var instances : Object = {};

        function setOption(key : String, value) : void {
            this.options[key] = value;
        }

        function compile(fname : String) : void {
            if (!this.options.lang && /\.cs$/.test(fname)) {
                this.options.lang = 'csharp';
            }
            var src : Source = null;
            try {
                src = new Source(fname);
            } catch (e) {
                throw new Exception(e+'');
            }
            this.compile_(src);
        }

        function compileFromSource(source : String) : void {
            this.compile_(Source.fromString(source));
        }

        private function compile_(source : Source) : void {
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
                    fatalError('unknown language "'+lang+'".');
                    return;
                }
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

            // compile
            var compiled : Script.Compiled = null;
            try {
                compiled = script.compileFromSource(source, provider);
            } catch (e) {
                if (e instanceof Script.Translation.Error) {
                    var loc : String = [e.meta.line, e.meta.col||1].join(',');
                    var msg : String = e.meta.file+'('+loc+')'+': '+e.message;
                    throw new Exception(msg);
                } else {
                    throw new Exception(e+'');
                }
            }
            this.compiled = compiled;

            if (compiled.failed) {
                // compilation failed
                Script.compileError(compiled.result.Errors); // throws
            }
        }

        function run(args : String[]) {
            if (!this.requireAssembly()) return;

            // run
            try {
                var m : MethodInfo = this.asm().EntryPoint;
                if (m) return m.Invoke(null, [args]);
            } catch (e) {
                // script evaluation failed
                this.compiled.runtimeError(e); // throws
            }
        }

        function type(name : String) : Type {
            if (!this.requireAssembly()) return null;

            var asm : System.Reflection.Assembly = this.asm();
            return asm.GetType(name);
        }

        function create(klass : String, params : Object[]) : Instance {
            var types : Type[] = getTypes(params);

            var k : Type = this.type(klass);
            var m : ConstructorInfo = k.GetConstructor(types);
            if (m) {
                try {
                    var obj : Object =  m.Invoke(params);
                    var id = obj.GetHashCode();
                    var instance = new Instance(id, this);
                    this.instances[id] = obj;
                    return instance;
                } catch (e) {
                    this.compiled.runtimeError(e);
                }
            } else {
                throw new Exception('');
            }
        }

        function invoke(klass : String, method : String, params : Object[]) {
            // class method
            return this.invoke_(this.type(klass), null, method, params);
        }

        function invokeI(obj : Instance, method : String, params : Object[]) {
            // instance method
            var r : Object = this.instances[obj.id];
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

        function getProp(obj : Instance, prop : String, index : Object[]) {
            var r : Object = this.instances[obj.id];
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

        function setProp(obj : Instance, prop : String, val : Object,
                         index : Object[]) {
            var r : Object = this.instances[obj.id];
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

        private function asm() : System.Reflection.Assembly {
            return this.compiled.result.CompiledAssembly
        }

        private function requireAssembly() : boolean {
            if (!this.compiled || this.compiled.failed) {
                fatalError('nothing compiled.');
                return false;
            }

            return !!this.asm();
        }
    }
}
