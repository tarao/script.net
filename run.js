WScript.Quit((function() {
    var CLI = /cscript.exe$/.test(WScript.FullName);
    var FSO = WScript.CreateObject('Scripting.FileSystemObject');

    var Path = {
        join: function() {
            var path = arguments[0] || '';
            for (var i=1; i < arguments.length; i++) {
                path = FSO.BuildPath(path, arguments[i]);
            }
            return path;
        },
        parent: function(path) { return FSO.GetParentFolderName(path); }
    };

    var FOLDER_SPEC = {
        WIN: 0,
        SYS: 1,
        TMP: 2
    };

    var TMPDIR = FSO.GetSpecialFolder(FOLDER_SPEC.TMP).Path;
    var SRCDIR = 'build';
    var OUTDIR = Path.join(TMPDIR, 'gnn.script.net');
    var MODDIR = 'lib';
    var MODULES = [
        'GNN.Scripting.Script.js',
        'GNN.Scripting.Preprocessor.js',
        'GNN.Scripting.Compiler.js',
        'GNN.Scripting.Impl.js',
        'GNN.Scripting.js'
    ];
    var BOOTSTRAP = 'compile.js';
    var SOURCE = 'script.net.js';
    var OUTPUT = CLI ? 'cscript.net.exe' : 'wscript.net.exe';
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
    ].join("\n")

    var IO = {
        print: function(msg) {
            CLI ? WScript.StdOut.Write(msg) : WScript.Echo(msg);
        },
        puts: function(msg) {
            CLI ? WScript.StdOut.WriteLine(msg) : WScript.Echo(msg);
        },
        err: function(msg) {
            CLI ? WScript.StdErr.WriteLine(msg) : WScript.Echo(msg);
        }
    };

    var Runner = (function(klass) {
        klass.SW = {
            HIDE:           0,
            NORMAL:         1,
            MINIMIZED:      2,
            MAXIMIZED:      3,
            NOACTIVATE:     4,
            SHOW:           5,
            MINIMIZE:       6,
            MINNOACTIVE:    7,
            NA:             8,
            RESTORE:        9,
            'DEFAULT':     10,
            FORCEMINIMIZE: 11,
            MAX:           11
        };
        return klass;
    })(function() {
        var self = { shell: WScript.CreateObject('WScript.Shell') };
        self.run = function(cmd, show, wait) {
            if (typeof wait == 'undefined') wait = true;
            if (CLI) {
                var exec = self.shell.exec(cmd);
                if (wait) {
                    while (exec.Status == 0) {
                        if (!exec.StdOut.AtEndOfStream) {
                            WScript.StdOut.Write(exec.StdOut.ReadAll());
                        }
                        if (!exec.StdErr.AtEndOfStream) {
                            WScript.StdErr.Write(exec.StdErr.ReadAll());
                        }
                        WScript.Sleep(0);
                    }
                    return exec.ExitCode;
                } else {
                    return 0;
                }
            } else {
                if (typeof show == 'undefined') show = 10;
                return self.shell.run(cmd, show, wait);
            }
        };
        self.script = function(cmd, show, wait) {
            cmd = [ WScript.FullName, '/Nologo', cmd ].join(' ');
            return self.run(cmd, show, wait);
        };
        return self;
    });

    var build = function(file) {
        var runner = new Runner();
        runner.shell.CurrentDirectory = Path.join(path, SRCDIR);

        var cmd = [
            BOOTSTRAP, '/nologo', '/fast+', '/debug-',
            '/out:'+file.binary
        ];
        if (file.target) cmd.push('/target:'+file.target);
        if ((file.reference||[]).length > 0) {
            cmd.push('/reference:'+file.reference.join(';'));
        }
        cmd.push(file.source);

        return runner.script(cmd.join(' '), Runner.SW.HIDE, true);
    };

    if (SCRIPT_ARGS.length <= 0) {
        IO.puts(HELP);
        return 0;
    }

    var path = Path.parent(WScript.ScriptFullName);
    var outdir = OUTDIR;
    if (!FSO.FolderExists(outdir)) FSO.CreateFolder(outdir);

    var main = {
        source: Path.join(path, SRCDIR, SOURCE),
        binary: Path.join(outdir, OUTPUT),
        target: (CLI ? null : 'winexe'),
        reference: []
    };
    var modules = [];
    for (var i=0; i < MODULES.length; i++) {
        var out = [ FSO.GetBaseName(MODULES[i]), 'dll'].join('.');
        out = Path.join(outdir, out);
        var reference = main.reference.concat([]);
        main.reference.push(out);
        modules.push({
            source: Path.join(path, MODDIR, MODULES[i]),
            binary: out,
            reference: reference,
            target: 'library'
        });
    }

    var files = modules.concat([main]);
    for (var i=0; i < files.length; i++) {
        var file = files[i];
        file.exist = {
            source: FSO.FileExists(file.source),
            binary: FSO.FileExists(file.binary)
        };
        if (file.exist.source && file.exist.binary) {
            var binary = FSO.GetFile(file.binary);
            var source = FSO.GetFile(file.source);
            if (binary.DateLastModified < source.DateLastModified) {
                if (build(file) != 0) return 2;
            }
        } else if (!file.exist.binary) {
            if (build(file) != 0) return 2;
        } else if (!file.exist.source && !file.exist.binary) {
            IO.err("Could not find '" + file.source + "'");
            return 1;
        }
    }

    var cmd = [ main.binary ]; var wait;
    if (WAIT) wait = !/(false|no|off|0)/.test(WAIT.toLowerCase());
    SHOW = Runner.SW[SHOW];
    if (typeof SHOW == 'undefined') SHOW = Runner.SW['DEFAULT'];
    var runner = new Runner();
    runner.shell.CurrentDirectory = CWD;
    return runner.run(cmd.concat(SCRIPT_ARGS).join(' '), SHOW, wait);
})());
