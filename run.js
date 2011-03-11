WScript.Quit((function() {
    var CLI = /cscript.exe$/.test(WScript.FullName);
    var FSO = WScript.CreateObject('Scripting.FileSystemObject');

    var BINDIR = FSO.GetParentFolderName(WScript.ScriptFullName);
    var LIBDIR = FSO.BuildPath(FSO.BuildPath(BINDIR, 'build'), 'lib');

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

    var CWD = WScript.CreateObject('WScript.Shell').CurrentDirectory;
    var SHOW = (WScript.Arguments.Named.Item('show')||'DEFAULT').toUpperCase();
    var WAIT = WScript.Arguments.Named.Item('wait');
    var SCRIPT_ARGS = [];

    for (var i=0; i < WScript.Arguments.Length; i++) {
        var arg = WScript.Arguments(i);
        if (!new RegExp('^/(show|wait):').test(arg.toLowerCase())) {
            SCRIPT_ARGS.push('"'+arg+'"');
        }
    }

    var HELP = [
        [ 'Usage:', WScript.ScriptName,
          '[/wait:true|false]',
          '[/show:<show>]',
          '[OPTIONS]',
          '<script>',
          '<args>...'
        ].join(' '),
        'Options:',
        '  <show>   One of the following values:',
        '             HIDE NORMAL MINIMIZED MAXIMIZED NOACTIVATE SHOW',
        '             MINIMIZE MINNOACTIVE NA RESTORE DEFAULT FORCEMINIMIZE',
        '  OPTIONS  Options passed to the script runner.',
        '           Try "' + WScript.ScriptName + ' /help" for the detail.',
    ].join("\n");

    if (SCRIPT_ARGS.length <= 0) {
        IO.puts(HELP);
        return 0;
    }

    var source = 'script.net.js';
    var output = CLI ? 'cscript.net.exe' : 'wscript.net.exe';

    var main = {
        source: Path.join(SRCDIR, source),
        binary: Path.join(TMPDIR, output),
        target: (CLI ? null : 'winexe'),
        reference: []
    };

    try {
        build({
            compile: BOOTSTRAP,
            main: main,
            modules: MODULES,
            dir: {
                out: TMPDIR,
                root: BINDIR
            }
        });
    } catch (e) {
        return e;
    }

    var cmd = [ main.binary ]; var wait;
    if (WAIT) wait = !/(false|no|off|0)/.test(WAIT.toLowerCase());
    SHOW = Runner.SW[SHOW];
    if (typeof SHOW == 'undefined') SHOW = Runner.SW['DEFAULT'];
    var runner = new Runner();
    runner.shell.CurrentDirectory = CWD;
    return runner.run(cmd.concat(SCRIPT_ARGS).join(' '), SHOW, wait);
})());
