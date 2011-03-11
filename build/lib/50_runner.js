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
