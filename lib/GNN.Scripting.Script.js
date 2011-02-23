import System;
import System.IO;

package GNN.Scripting.Script {
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
}
