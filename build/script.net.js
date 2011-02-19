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
            var m = new RegExp('^/([^:+-]*)(?:([:+-])(.*))?$').exec(args[0]);
            if (!m) break;
            var val = (m[2] == ':' ? (m[3]||true) : !(m[2] == '-'));
            named[m[1]] = val;
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
            '[OPTIONS]',
            '<script>',
            'args...'
        ].join(' '));
        Console.Out.WriteLine('Options:');
        var options = [
            [ '/run[+|-]',
              'Immediately run after the compilation (default).' ],
            [ '/debug[+|-]',
              'Generate debug information.' ],
            [ '/out:<file>',
              'Output binary file.' ],
            [ '/target:exe',
              'Console application (default).' ],
            [ '/target:winexe',
              'Windows application.' ],
            [ '/target:library',
              'Library assembly.' ],
            [ '/lang:jscript',
              'Compile JScript source code (default).' ],
            [ '/lang:csharp',
              'Compile C# source code.' ],
            [ '/import:none',
              'Add no reference assemblies.' ],
            [ '/import:standard',
              'Add standard reference assemblies.' ],
            [ '/import:configured',
              'Add reference assemblies from .rsp file (default).' ],
            [ '/autoref[+|-]',
              'Automatically add references to assemblies of' ],
            [ '',
              'imported packages (JScript feature).' ],
            [ '/fast[+|-]',
              'Generate optimized code.' ],
            [ '/optimize[+|-]',
              'Generate optimized code.' ],
            []
        ]; options.pop();
        var max=0; var i;
        for (i=0; i < options.length; i++) {
            if (max < options[i][0].length) max = options[i][0].length;
        }
        for (i=0; i < options.length; i++) {
            var option = '  '+options[i][0];
            var desc = options[i][1];
            for (var j=max-option.length+4; 0 <= j ; j--) option += ' ';
            Console.Out.WriteLine(option+desc);
        }
        return;
    }

    var argv : String[] = args;
    if (named.run == false || named.target == 'library') {
        GNN.Scripting.Runner.using(function(runner) {
            if (runner.load(fname, named)) {
                Environment.ExitCode = 0;
            } else {
                Environment.ExitCode = 1;
            }
        });
    } else {
        var r = GNN.Scripting.Runner.run(named, fname, argv);
        Environment.ExitCode = r;
    }
})();
