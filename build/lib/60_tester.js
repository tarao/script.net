var Tester = (function(klass) {
    klass.binary = 'nunit-console.exe';

    klass.findDir = function() {
        var reg = new WinReg();

        var key = 'Software\\nunit.org\\NUnit';
        var versions = reg.enumKey(WinReg.HK.CU, key);
        if (versions.length <= 0) return;

        key = key + '\\' + versions.sort()[versions.length-1];
        var dir = reg.get(WinReg.HK.CU, key, 'InstallDir');

        if (dir) {
            dir = Path.join(dir, 'bin');
            var candidate;
            var e = new Enumerator(FSO.GetFolder(dir).SubFolders);
            for (; !e.atEnd(); e.moveNext()) {
                var name = e.item().Name;
                if (FSO.FileExists(Path.join(dir, name, klass.binary))) {
                    candidate = Path.join(dir, name);
                }
            }
            return candidate;
        }
    };

    klass.refs = function() {
        var dir = klass.findDir();
        if (!dir) return [];

        var r = [];
        dir = Path.join(dir, 'framework');
        var e = new Enumerator(FSO.GetFolder(dir).Files);
        for (; !e.atEnd(); e.moveNext()) {
            var name = e.item().Name;
            if (/\.dll$/.test(name)) r.push(Path.join(dir, name));
        }
        return r;
    };

    return klass;

})(function(cwd) {
    var runner = new Runner();
    runner.shell.CurrentDirectory = cwd;
    var binary = Path.join(Tester.findDir(), Tester.binary);

    return {
        run: function(tests) {
            tests.forEach(function(t) {
                IO.puts(binary+' '+t);
                runner.run(binary+' '+t);
            });
        }
    };
});
