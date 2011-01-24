/*
    Find .NET runtime directory and run JScript compiler.
 */
WScript.Quit((function() {
    var CLI = /cscript.exe$/.test(WScript.FullName);

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

    var Env = function(env) {
        var Path = function(env, PATH) {
            var self = {};
            PATH = PATH || 'PATH';
            self.get = function(){ return env.Item(PATH); };
            self.unshift = function(value) {
                env.Item(PATH) = [ value, self.get() ].join(';');
            };
            return self;
        };

        var self = function(key){ return env.Item(key); };
        self.path = new Path(env);
        return self;
    };

    // find directories including jsc.exe
    var dirs = function(dir) {
        var ret = [];
        var e = new Enumerator(FSO.GetFolder(dir).SubFolders);
        for (; !e.atEnd(); e.moveNext()) {
            var name = e.item().Name;
            if (/^v.*/.test(name) &&
                FSO.FileExists(Path.join(dir, name, 'jsc.exe'))) {
                ret.push(Path.join(dir, name));
            }
        }
        return ret;
    };

    var shell = WScript.CreateObject('WScript.Shell');
    var env = new Env(shell.Environment('PROCESS'));

    var dir = Path.join(env('WINDIR'), 'Microsoft.NET', 'Framework');
    if (WScript.Arguments.Named.Item('platform') == 'x64') dir += '64';
    var versions = dirs(dir);

    if (versions.length <= 0) {
        IO.err('JScript.NET compiler: Could not find jsc.exe.');
        return 1;
    }

    // extend the environment
    for (var i=0; i < versions.length; i++) {
        env.path.unshift(versions[i]);
    }

    // run the compiler
    var cmd = [ 'jsc' ];
    for (var i=0; i < WScript.Arguments.Length; i++) {
        cmd.push('"'+WScript.Arguments(i)+'"');
    }
    var SHOW = Runner.SW[CLI ? 'DEFAULT' : 'HIDE'];
    return new Runner().run(cmd.join(' '), SHOW);

    return 0;
})());
