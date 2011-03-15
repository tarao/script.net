WScript.Quit((function() {
    var CLI = /cscript.exe$/.test(WScript.FullName);
    var FSO = WScript.CreateObject('Scripting.FileSystemObject');

    var BINDIR = FSO.GetParentFolderName(WScript.ScriptFullName);
    var LIBDIR = FSO.BuildPath(FSO.BuildPath(BINDIR, 'build'), 'lib');
    var TESTDIR = FSO.BuildPath(BINDIR, 'test');

    // load bootstrap libraries
    var e = new Enumerator(FSO.GetFolder(LIBDIR).Files);
    for (; !e.atEnd(); e.moveNext()) {
        var name = e.item().Name;
        if (/.*\.js$/.test(name)) {
            var ts = FSO.OpenTextFile(FSO.BuildPath(LIBDIR, name));
            eval(ts.ReadAll());
            ts.Close();
        }
    }

    var TESTS = [];
    var e = new Enumerator(FSO.GetFolder(TESTDIR).Files);
    for (; !e.atEnd(); e.moveNext()) {
        var name = e.item().Name;
        if (/.*\.cs$/.test(name)) TESTS.push(Path.join(TESTDIR, name));
    }

    var refs = Tester.refs();
    refs = refs.map(function(r) {
        var dst = Path.join(TESTDIR, FSO.GetFileName(r));
        FSO.CopyFile(r, dst);
        return dst;
    });

    try {
        build({
            compile: BOOTSTRAP,
            main: { reference: ['Microsoft.JScript.dll'].concat(refs) },
            modules: MODULES.concat(TESTS),
            dir: {
                out: TESTDIR,
                root: BINDIR
            }
        });
    } catch (e) {
        return e;
    }

    var tester = new Tester(TESTDIR);
    tester.run(TESTS.map(function(t){ return t.replace(/\.cs$/, '.dll'); }));

    return 0;
})());
