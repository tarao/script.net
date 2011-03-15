var build = (function() {
    var build_ = function(cmd, cd, module) {
        var runner = new Runner();
        runner.shell.CurrentDirectory = cd;

        var cmd = [
            cmd, '/nologo', '/debug-', '/dynamic+',
            '"/out:'+module.binary+'"'
        ];
        if (module.target) cmd.push('/target:'+module.target);
        if (module.lang) {
            cmd.push(/^js/.test(module.lang) ? '/fast+' : '/optimize+');
            cmd.push('/lang:'+module.lang);
        }
        if ((module.reference||[]).length > 0) {
            cmd.push('"/reference:'+module.reference.join(';')+'"');
        }
        cmd.push(module.source);

        return runner.script(cmd.join(' '), Runner.SW.HIDE, true);
    };

    return function(args) {
        var main = args.main;
        var modules = args.modules;
        var mods = [];

        modules.forEach(function(file) {
            var out = [ FSO.GetBaseName(file), 'dll'].join('.');
            out = Path.join(args.dir.out, out);
            var reference = main.reference.concat([]);
            main.reference.push(out);
            var lang = /\.js$/.test(file) ? 'jscript' : 'csharp';
            mods.push({
                source: file,
                binary: out,
                reference: reference,
                lang: lang,
                target: 'library'
            });
        });

        mods.concat([main]).forEach(function(file) {
            file.exist = {
                source: FSO.FileExists(file.source),
                binary: FSO.FileExists(file.binary)
            };
            if (file.exist.source && file.exist.binary) {
                var binary = FSO.GetFile(file.binary);
                var source = FSO.GetFile(file.source);
                if (binary.DateLastModified < source.DateLastModified &&
                    build_(args.compile, args.dir.root, file) != 0) {
                    throw 2;
                }
            } else if (!file.exist.binary &&
                       build_(args.compile, args.dir.root, file) != 0) {
                throw 2;
            } else if (!file.exist.source && !file.exist.binary) {
                IO.err("Could not find '" + file.source + "'");
                throw 1;
            }
        });
    };
})();
