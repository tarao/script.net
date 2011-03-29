import System;
import System.IO;
import System.Collections;
import System.Threading;
import System.Runtime.Serialization;
import System.Runtime.Serialization.Formatters.Soap;
import GNN.Scripting;
import Microsoft.JScript;

package GNN.Scripting {
    class Cache {
        static class Entry {
            static function fromObject(obj : Object) : Entry {
                var table : Hashtable = new Hashtable();

                for (var f : String in obj) {
                    table[f] = obj[f];
                }

                return new Entry(table);
            }

            static function fromFile(file : String) : Entry {
                var table : Hashtable = null;

                tryIO(function() {
                    var fs : FileStream;
                    fs = new FileStream(file, FileMode.Open,
                                        FileAccess.Read, FileShare.None);
                    try {
                        var f : IFormatter = formatter;
                        table = f.Deserialize(fs);
                    } finally {
                        fs.Dispose();
                    }
                });

                return new Entry(table || new Hashtable());
            }

            function Entry(table : Hashtable) {
                this.table = table;
            }

            function equals(other : Entry) : boolean {
                for (var x : DictionaryEntry in other.table) {
                    if (this.table[x.Key] != x.Value) return false;
                }
                return true;
            }

            function save(file : String) : void {
                var self : Entry = this;
                tryIO(function() {
                    var fs : FileStream;
                    fs = new FileStream(file, FileMode.Create,
                                        FileAccess.Write, FileShare.None);
                    try {
                        var f : IFormatter = formatter;
                        f.Serialize(fs, self.table);
                    } finally {
                        fs.Dispose();
                    }
                });
            }

            var table : Hashtable;

            private static function get formatter() : IFormatter {
                return new SoapFormatter();
            }

            private static function tryIO(callback : Function) : void {
                for (var i : int = 0; i < 100; i++) {
                    try {
                        callback();
                        break;
                    } catch (e) {
                        var exc : Exception = ErrorObject.ToException(e);
                        if (exc.GetType == 'IOException') {
                            Thread.Sleep(100);
                            continue;;
                        }
                        break;
                    }
                }
            }
        }

        static function directory() : String {
            return Util.assemblyDir();
        }

        function Cache(o : Object) {
            var base : String = Util.hash(o.input||'');
            var prefix : String = o.file ? 'r' : 'e';
            prefix = prefix + (o.target||'e').replace(/^(.).*$/, '$1');
            if (o.debug) prefix = prefix + 'd';
            if (o.optimize || o.fast) prefix = prefix + 'o';
            prefix = prefix.toLowerCase();
            base = [ prefix, Util.arch(), Util.rtVer(), base ].join('_');
            this.base = Path.Combine(directory(), base);
            this.entry = Entry.fromFile(this.file);
        }

        function update(src : String, o : Object) : boolean {
            var fields : String[] = [ 'file' ];

            var obj : Object = { hash: Util.hash(src) };
            for (var i : int = 0; i < fields.length; i++) {
                var f = fields[i];
                obj[f] = o[f] || null;
            }

            var entry : Entry = Entry.fromObject(obj);
            var modified : boolean = !this.entry.equals(entry);
            if (modified) {
                entry.save(this.file);
                this.entry = entry;
            }

            return modified;
        }

        function get file() : String {
            return this.base + '.cache';
        }

        var base : String;
        var entry : Entry;
    }
}
