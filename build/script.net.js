/*
    .NET scripting
 */
import System;
import System.IO;
import Microsoft.JScript;
import GNN.Scripting;
import GNN.Scripting.Reflection;

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
    if (named.help || named['?'] || !fname || fname.length == 0) {
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
            [ '/lang:js[cript]',
              'Compile JScript source code (default).' ],
            [ '/lang:cs[harp]',
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
            [ '/cache[+|-]',
              'Cache compiled assemblies (default).' ],
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
    try {
        GNN.Scripting.Runner.using(function(runner) {
            // compile
            var asm : Assembly = runner.load(fname, named);
            if (asm.warned) {
                Console.Error.WriteLine(asm.warnings.join("\n"));
            }

            // run
            if (named.run == false || named.target == 'library') {
                Environment.ExitCode = 0;
            } else {
                Environment.ExitCode = asm.run(argv);
            }
        });
    } catch (err) {
        var e : Exception = ErrorObject.ToException(err);
        var msg : String = e.Message;
        if (e instanceof GNN.Scripting.FatalError) {
            msg = '[GNN.Scripting] Error: ' + msg;
        }
        Console.Error.WriteLine(msg);
        Environment.ExitCode = -1;
    }
})();
