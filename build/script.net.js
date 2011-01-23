/*
    .NET scripting
 */
import System;
import System.IO;
import Microsoft.CSharp;
import Microsoft.JScript;

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

    var script = new GNN.Script();
    if (named.target) script.options.target = named.target;

    // import assemblies
    if (named['import'] == 'none') {
    } else if (named['import'] == 'standard') {
        script.importStandardAssemblies();
    } else {
        script.importConfiguredAssemblies();
    }

    // select language
    var provider=null; var m;
    if (named.lang) {
        if ('csharp'.indexOf(named.lang.toLowerCase()) == 0) {
            provider = new CSharpCodeProvider();
        } else if ('jscript'.indexOf(named.lang.toLowerCase()) == 0) {
            provider = new JScriptCodeProvider();
        }
        if (!provider) {
            Console.Error.WriteLine('Unknown language "'+named.lang+'"');
            return;
        }
    } else if (/\.cs$/.test(fname)) {
        provider = new CSharpCodeProvider();
    } else {
        provider = new JScriptCodeProvider();
    }

    // compile
    var res = script.compile(fname, provider);
    if (0 < res.Errors.Count) {
        for (var i =0; i < res.Errors.Count; i++) {
            Console.Error.WriteLine(res.Errors[i].ToString());
        }
        return;
    }

    // run
    var asm = res.CompiledAssembly;
    var method = asm.EntryPoint;
    var params : String[] = args.concat([]);
    method.Invoke(null, [params]);
})();
