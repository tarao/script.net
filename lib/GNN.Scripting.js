import System;
import System.IO;
import System.Collections;
import GNN.Scripting;
import GNN.Scripting.Reflection;

package GNN.Scripting {
    class Runner implements IDisposable {
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

        function eval(source : String, options) {
            options = toObject(options||{});
            var id : String = 'hash://'+Util.hash(source);
            var asm : Assembly = this.cache[id];
            if (!asm) asm = Assembly.fromSource(source, options).load();
            if (asm) {
                this.cache[id] = asm;
                return options.target != 'library' ? asm.run() : asm;
            }
        }

        function load(fname : String, options) : Assembly {
            var id : String = getId(fname);

            this.unloadById(id);
            var cache : Assembly = new Assembly(fname, toObject(options||{}));
            this.cache[id] = cache;
            return cache.load();
        }

        function run(fname : String, ...args : String[]) {
            var id : String = getId(fname);
            var cache : Assembly = this.cache[id] || this.load(fname, null);
            if (cache) return cache.run(args);
        }

        function unload(fname : String) : void {
            this.unloadById(getId(fname));
        }

        function unloadAll() : void {
            for (var id : String in this.cache) this.unloadById(id);
        }

        override function Dispose() : void {
            this.unloadAll();
        }

        private static function toObject(dic) : Object {
            if (dic instanceof IDictionary) {
                var result : Object = {};
                var e : IDictionaryEnumerator = dic.GetEnumerator();
                while (e.MoveNext()) result[e.Key] = e.Value;
                return result;
            } else {
                return dic;
            }
        }

        private static function getId(fname : String) : String {
            return Path.GetFullPath(fname);
        }

        private var cache : Object = {}; // on-memory cache

        private function unloadById(id) : void {
            var cache : Assembly = this.cache[id];
            if (cache) {
                cache.unload();
                this.cache[id] = null;
            }
        }
    }
}
