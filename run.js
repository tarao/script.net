WScript.Quit((function() {
    var CLI = /cscript.exe$/.test(WScript.FullName);

    var SRCDIR = 'build';
    var OUTDIR = 'build';
    var MODDIR = 'lib';
    var MODULES = [ 'GNN.Script.js' ];
    var BOOTSTRAP = 'bootstrap.js';
    var SOURCE = 'script.net.js';
    var OUTPUT = CLI ? 'cscript.net.exe' : 'wscript.net.exe';
    var CWD = WScript.CreateObject('WScript.Shell').CurrentDirectory;
    var SHOW = (WScript.Arguments.Named.Item('show')||'DEFAULT').toUpperCase();

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
            if (CLI) {
                if (typeof wait == 'undefined') wait = true;
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

    var build = function(file) {
        var runner = new Runner();
        runner.shell.CurrentDirectory = Path.join(path, SRCDIR);

        var cmd = [
            BOOTSTRAP, '/nologo',
            '/out:'+file.binary
        ];
        if (file.target) cmd.push('/target:'+file.target);
        if ((file.reference||[]).length > 0) {
            cmd.push('/reference:'+file.reference.join(';'));
        }
        cmd.push(file.source);

        return runner.script(cmd.join(' '), Runner.SW.HIDE, true);
    };

    SHOW = Runner.SW[SHOW];
    if (typeof SHOW == 'undefined') SHOW = Runner.SW['DEFAULT'];

    var path = Path.parent(WScript.ScriptFullName);
    var outdir = Path.join(path, OUTDIR);

    var main = {
        source: Path.join(path, SRCDIR, SOURCE),
        binary: Path.join(outdir, OUTPUT),
        target: (CLI ? null : 'winexe'),
        reference: []
    };
    var modules = [];
    for (var i=0; i < MODULES.length; i++) {
        var out = [ FSO.GetBaseName(MODULES[i]), 'dll'].join('.');
        main.reference.push(out);
        modules.unshift({
            source: Path.join(path, MODDIR, MODULES[i]),
            binary: Path.join(outdir, out),
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

    var count=0; var wait = 20; var max=5000;
    while (!FSO.FileExists(main.binary) && count < max) {
        count += wait;
        WScript.Sleep(wait);
    }

    var cmd = [ main.binary ]; var wait;
    var argwait = WScript.Arguments.Named.Item('wait');
    if (argwait) wait = /(true|yes|on|1)/.test(argwait.toLowerCase());
    for (var i=0; i < WScript.Arguments.Length; i++) {
        var arg = WScript.Arguments(i);
        if (!new RegExp('^/(show|wait):').test(arg.toLowerCase())) {
            cmd.push('"'+arg+'"')
        }
    }
    var runner = new Runner();
    runner.shell.CurrentDirectory = CWD;
    runner.run(cmd.join(' '), SHOW, wait);

    return 0;
})());
