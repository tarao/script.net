import System;
import System.IO;
import Microsoft.JScript;
import GNN.Scripting.Script;

package GNN.Scripting.Preprocessor {
    interface Factory {
        function create(context : Context) : Translator;
    }

    class DefaultFactory implements Factory {
        function create(context : Context) : Translator {
            return Chain.fromArray([
                new Include(context),
                new Import(context),
                new Link(context),
                new NormalizePosition(context)
            ]);
        }
    }

    class Error {
        function Error(message : String, meta : Line) {
            this.message = message;
            this.meta = meta;
        }

        var message : String;
        var meta : Line;
    }

    class Identity implements Translator {
        function line(l : Line) : Code {
            return l;
        }

        function source(s : Source) : Code {
            return s.map(this);
        }

        function code(code : Code) : Code {
            return code;
        }
    }

    class Dumper extends Identity {
        function Dumper(w : TextWriter) {
            this.w = w || Console.Out;
        }

        function line(l : Line) : Code {
            this.w.WriteLine(l.code);
            return l;
        }

        var w : TextWriter;
    }

    class Chain implements Translator {
        static function fromArray(a : Translator[]) : Translator {
            var t : Translator = new Identity();
            for (var i : int = a.length-1; 0 <= i; i--) {
                t = new Chain(a[i], t);
            }
            return t;
        }

        function Chain(t : Translator, next : Translator) {
            this.trans = t;
            this.next = next;
        }

        function line(l : Line) : Code {
            return this.trans.line(l).map(this.next);
        }

        function source(s : Source) : Code {
            return this.trans.source(s).map(this.next);
        }

        function code(code : Code) : Code {
            return this.trans.code(code).map(this.next);
        }

        var trans : Translator;
        var next : Translator;
    }

    class Base extends Identity {
        static function resolvePath(sourceFile : String, file : String)
        : String {
            if (Path.IsPathRooted(file)) return file;
            var dir : String = Path.GetDirectoryName(sourceFile);
            return Path.Combine(dir, file);
        }

        function Base(context : Context) {
            this.context = context;
        }

        var context : Context;
    }

    class Include extends Base {
        function Include(context : Context) {
            super(context);
        }

        function line(l : Line) : Code {
            var r : String = this.context.directive.regex('include');
            var regex : RegExp = new RegExp(r);
            var m : RegExpMatch = regex.exec(l.code);
            if (m) {
                var file : String = m[1] || m[2];
                if (l.file) file = resolvePath(l.file, file);
                var src : Source = null;
                try {
                    src = Source.fromFile(file);
                } catch (e) {
                    throw new Error(e.message, l);
                }
                return this.context.marker.expand(l, this.source(src));
            }
            return l;
        }

        function source(s : Source) : Code {
            var fname : String = s.fname;
            var c : Code = super.source(s);
            return this.context.marker.enclose(fname, c);
        }
    }

    class Import extends Base {
        function Import(context : Context) {
            super(context);
        }

        function line(l : Line) : Code {
            var r : String = this.context.directive.regex('import');
            var regex : RegExp = new RegExp(r);
            var m : RegExpMatch = regex.exec(l.code);
            if (m && (m[3] || m[4])) {
                l.code = m[1]+' '+m[2]+';';
                var file : String = m[3] || m[4];
                if (l.file) {
                    file = resolvePath(l.file, file);
                }
                this.context.importer.importLocalAssembly(file);
            }
            return l;
        }
    }

    class Link extends Base {
        function Link(context : Context) {
            super(context);
        }

        function line(l : Line) : Code {
            var r : String = this.context.directive.regex('link');
            var regex : RegExp = new RegExp(r);
            var m : RegExpMatch = regex.exec(l.code);
            if (m && (m[1] || m[2])) {
                l.code = '';
                var file : String = m[1] || m[2];
                if (l.file) {
                    file = resolvePath(l.file, file);
                }
                this.context.importer.importLocalAssembly(file);
            }
            return l;
        }
    }

    class NormalizePosition extends Base {
        function NormalizePosition(context : Context) {
            super(context);
            this.open = false;
        }

        function line(l : Line) : Code {
            var r1 : String = this.context.directive.regex('position');
            var r2 : String = this.context.directive.regex('position-end');
            var regex1 : RegExp = new RegExp(r1);
            var regex2 : RegExp = new RegExp(r2);
            if (regex1.test(l.code)) {
                if (this.open) return this.context.marker.insertEnd(l);
                this.open = true;
            } else if (regex2.test(l.code)) {
                this.open = false;
            }
            return l;
        }

        var open : boolean;
    }

    class Context {
        function Context(directive : Directive, marker : LineMarker,
                         importer : Importer) {
            this.directive = directive;
            this.marker = marker;
            this.importer = importer;
        }

        var directive : Directive;
        var marker : LineMarker;
        var importer : Importer;
    }

    interface Directive {
        function regex(what) : String;
    }

    interface LineMarker {
        function enclose(fname : String, c : Code) : Code;
        function expand(l : Line, c : Code) : Code;
        function insertEnd(c : Code) : Code;
    }

    interface Importer {
        function importLocalAssembly(name : String) : void;
    }

    abstract class DirectiveBase implements Directive {
        abstract function get prefix() : String;
        abstract function regexPosition() : String;
        abstract function regexPositionEnd() : String;
        abstract function regexImport() : String;

        function regex(what) : String {
            switch (what) {
            case 'include':      return this.regexInclude();
            case 'position':     return this.regexPosition();
            case 'position-end': return this.regexPositionEnd();
            case 'import':       return this.regexImport();
            case 'link':         return this.regexLink();
            }
            return '';
        }

        function get quote() : String {
            var q1 : String = "'(.+)'";
            var q2 : String = '"(.+)"';
            return '(?:'+q1+'|'+q2+')';
        }

        function regexInclude() : String {
            return '^'+this.prefix+'include\\s*'+this.quote+'(?:\\s*;\\s*)?$';
        }

        function regexLink() : String {
            return '^'+this.prefix+'link\\s*'+this.quote+'\\s*(?:\\s*;\\s*)?$';
        }
    }

    class JScriptDirective extends DirectiveBase {
        function get prefix() : String {
            return '@';
        }

        function regexPosition() : String {
            return '^@set\\s+@position\\s*\\(\\s*[^e]';
        }

        function regexPositionEnd() : String {
            return '^@set\\s+@position\\s*\\(\\s*end\\s*\\)\\s*$';
        }

        function regexImport() : String {
            return '^(import)\\s+([^\\s]+)' +
                    '(?:\\s+in\\s*'+this.quote+')?\\s*;\s*$';
        }
    }

    class CSharpDirective extends DirectiveBase {
        function get prefix() : String {
            return '#';
        }

        function regexPosition() : String {
            return '^#line\\s+';
        }

        function regexPositionEnd() : String {
            return '';
        }

        function regexImport() : String {
            return '^(using)\\s+([^\\s]+)(?:\\s+in\\s*'+
                    this.quote+')?\\s*;\s*$';
        }
    }

    abstract class LineMarkerBase implements LineMarker {
        abstract function begin(file : String, line : int) : Line;
        abstract function insertEnd(c : Code) : Code;

        function enclose(fname : String, c : Code) : Code {
            return fname ? new Source([ this.begin(fname, 1), c ]) : c;
        }

        function expand(l : Line, c : Code) : Code {
            return new Source([ c, this.begin(l.file, l.line+1) ]);
        }
    }

    class JScriptLineMarker extends LineMarkerBase {
        function begin(file : String, line : int) : Line {
            var r1 : RegExp = new RegExp('\\\\', 'g');
            var r2 : RegExp = new RegExp("'", 'g');
            file = file.replace(r1, '\\\\').replace(r2, "\\'");
            var code : String = '@set @position(' + [
                "file='"+file+"'",
                'line='+line
            ].join(';') + ')';
            return new Line(null, 0, code);
        }

        function insertEnd(c : Code) : Code {
            var end : Line = new Line(null, 0, '@set @position(end)');
            return new Source([ end, c ]);
        }
    }

    class CSharpLineMarker extends LineMarkerBase {
        function begin(file : String, line : int) : Line {
            var r1 : RegExp = new RegExp('\\\\', 'g');
            var r2 : RegExp = new RegExp('"', 'g');
            file = file.replace(r1, '\\\\').replace(r2, '\\"');
            var code : String = [
                '#line',
                line,
                '"'+file+'"'
            ].join(' ');
            return new Line(null, 0, code);
        }

        function insertEnd(c : Code) : Code {
            return c;
        }
    }
}
