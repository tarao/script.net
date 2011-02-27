/*
    Find .NET runtime directory and run .NET compiler.
 */
WScript.Quit((function() {
    var CLI = /cscript.exe$/.test(WScript.FullName);

    var DEFAULT_LANG = 'JScript';
    var LANG = WScript.Arguments.Named.Item('lang') || DEFAULT_LANG;

    var CMD = {
        js: 'jsc.exe',
        cs: 'csc.exe'
    };
    var DEFAULT_CMD = CMD[DEFAULT_LANG.substr(0, 2).toLowerCase()];
    CMD = CMD[LANG.substr(0, 2).toLowerCase()] || DEFAULT_CMD;

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

    // find directories including {j|c}sc.exe
    var dirs = function(dir) {
        var ret = [];
        var e = new Enumerator(FSO.GetFolder(dir).SubFolders);
        for (; !e.atEnd(); e.moveNext()) {
            var name = e.item().Name;
            if (/^v.*/.test(name) &&
                FSO.FileExists(Path.join(dir, name, CMD))) {
                ret.push(Path.join(dir, name));
            }
        }
        return ret;
    };

    var shell = WScript.CreateObject('WScript.Shell');
    var env = new Env(shell.Environment('PROCESS'));

    var defs = [];

    var dir = Path.join(env('WINDIR'), 'Microsoft.NET', 'Framework');
    if (WScript.Arguments.Named.Item('platform') == 'x64') {
        defs.push('_X64');
        dir += '64';
    }
    var versions = dirs(dir);

    if (versions.length <= 0) {
        IO.err('.NET compiler: Could not find '+CMD+'.');
        return 1;
    }

    // extend the environment
    var latest = '';
    for (var i=0; i < versions.length; i++) {
        latest = versions[i];
        env.path.unshift(versions[i]);
    }

    // references
    var refs =
            WScript.Arguments.Named('reference') ||
            WScript.Arguments.Named('r');
    if (refs) refs = refs.split(';');
    refs = refs || [];

    // latest version
    var verRegex = /^v(\d+)\.(\d+)/i;
    var m = verRegex.exec(latest.split('\\').pop());
    if (m) {
        var major = parseInt(m[1]);
        var minor = parseInt(m[2]);
        if (major >= 4) {
            if (WScript.Arguments.Named('dynamic')) {
                refs.push('System.Dynamic.dll');
                refs.push('System.Core.dll');
            }
            defs.push('_NET4');
        }
        defs.push('_NET'+major+minor);
    }

    // run the compiler
    var cmd = [ CMD ];
    if (defs.length > 0) cmd.push('/define:'+defs.join(';'));
    if (refs.length > 0) cmd.push('/r:'+refs.join(';'));

    for (var i=0; i < WScript.Arguments.Length; i++) {
        var arg = WScript.Arguments(i);
        if (!new RegExp('^/lang:').test(arg.toLowerCase()) &&
            !new RegExp('^/r(?:eference)?:').test(arg.toLowerCase()) &&
            !new RegExp('^/dynamic[+-]?$').test(arg.toLowerCase())) {
            cmd.push('"'+arg+'"');
        }
    }
    var SHOW = Runner.SW[CLI ? 'DEFAULT' : 'HIDE'];
    return new Runner().run(cmd.join(' '), SHOW);

    return 0;
})());
