import System;
import System.IO;
import System.Collections;

package GNN.Scripting.Script {
    interface Code {
        function get fname() : String;
        function map(t : Translator) : Code;
        function toString() : String;
        function toLine() : Line;
        function toSource() : Source;
    }

    class Line implements Code {
        function Line(file : String, line : int, code : String) {
            this.file = file;
            this.line = line;
            this.code = code;
        }

        function get fname() : String {
            return this.file;
        }

        function map(t : Translator) : Code {
            return t.line(this);
        }

        function toString() : String {
            return this.code;
        }

        function toLine() : Line {
            return this;
        }

        function toSource() : Source {
            return null;
        }

        var file : String;
        var line : int;
        var code : String;
    }

    class Source implements Code {
        static function fromString(str : String) : Source {
            var ch : Char[] = [ "\n" ];
            var ss : String[] = str.Split(ch);
            return fromArray(null, ss);
        }

        static function fromFile(file : String) : Source {
            return fromArray(file, File.ReadAllLines(file));
        }

        static function fromArray(file : String, lines : String[]) {
            var code = new Code[lines.length];
            for (var i : int = 0; i < lines.length; i++) {
                code[i] = new Line(file||'', i+1, lines[i]);
            }
            return new Source(code);
        }

        function Source(lines : Code[]) {
            this.lines = lines;
        }

        function get fname() : String {
            for (var i : int = 0; i < this.lines.length; i++) {
                var code = this.lines[i];
                if (code.fname) return code.fname;
            }
            return null;
        }

        function map(t : Translator) : Code {
            for (var i : int = 0; i < this.lines.length; i++) {
                var code : Code = this.lines[i];
                if (code instanceof Line) {
                    code = t.line(code.toLine());
                } else if (code instanceof Source) {
                    code = t.source(code.toSource());
                } else {
                    code = t.code(code);
                }
                this.lines[i] = code;
            }
            return this;
        }

        function toString() : String {
            var result : Array = [];
            for (var i : int = 0; i < this.lines.length; i++) {
                var code = this.lines[i];
                if (code != null) result.push(code.toString());
            }
            return result.join("\n");
        }

        function toLine() : Line {
            return null;
        }

        function toSource() : Source {
            return this;
        }

        var lines : Code[];
    }

    interface Translator {
        function line(l : Line) : Code;
        function source(s : Source) : Code;
        function code(c : Code) : Code;
    }
}
