/*
    .NET scripting
 */
import System;
import System.IO;

import GNN;

(function() {
    var parseNamedArgs = function(args) {
        var named = {};
        while (args.length > 0) {
            var m = new RegExp('^/(.*?)(?::(.*))$').exec(args[0]);
            if (!m) break;
            named[m[1]] = m[2] || true;
            args.shift();
        }
        return named;
    };

    var args = [].concat(Environment.GetCommandLineArgs());
    var program = args.shift();
    var named = parseNamedArgs(args);
    var fname = args.shift();

    // script file must be specified
    if (!fname || fname.length == 0 || !File.Exists(fname)) {
        Console.Out.WriteLine([
            'Usage:',
            Path.GetFileName(program),
            '[/lang:{cs[harp]|js[cript]}]',
            '<script>',
            'args...'
        ].join(' '));
        return;
    }

    var runner = new GNN.ScriptRunner({
        lang: named.lang,
        target: named.target,
        'import': named['import']
    });
    runner.run.apply(runner, [fname].concat(args));
})();
