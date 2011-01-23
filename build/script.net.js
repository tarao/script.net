/*
    .NET scripting
 */
import System;
import System.IO;
import System.Reflection;
import System.CodeDom.Compiler;
import System.Runtime.InteropServices;
import Microsoft.CSharp;
import Microsoft.JScript;

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
    var getRuntimeDir = function() {
        var runtime = RuntimeEnvironment.GetRuntimeDirectory();
        if (new RegExp('\\'+Path.DirectorySeparatorChar+'$').test(runtime)) {
            runtime = runtime.substring(0, runtime.length-1);
        }
        return runtime;
    }
    var findCompilerConfiguration = function() {
        var runtime = getRuntimeDir();
        var current = Path.GetFileName(runtime);
        var dirs = Directory.GetDirectories(Path.GetDirectoryName(runtime));
        var skip = true;
        var path;
        for (var i=dirs.length-1; 0 <= i; i--) {
            if (Path.GetFileName(dirs[i]) == current) skip = false;
            path = Path.Combine(dirs[i], 'csc.rsp');
            if (!skip && File.Exists(path)) return path
        }
    }

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

    var cp = new CompilerParameters();
    cp.GenerateInMemory = true;
    cp.GenerateExecutable = true;

    var options = [];
    options.push('/lib:' + [
        Path.GetDirectoryName(Assembly.GetEntryAssembly().Location),
        RuntimeEnvironment.GetRuntimeDirectory()
    ].join(';'));
    if (named['target']) options.push('/target:'+named['target']);
    cp.CompilerOptions = options.join(' ');

    // this doesn't work
    // var probestr : String = 'lib;C:\\Users\\tarao\\work\\vmware\\build\\lib\\';
    // AppDomain.CurrentDomain.SetupInformation.PrivateBinPathProbe = probestr;
    // Console.Out.WriteLine(AppDomain.CurrentDomain.SetupInformation.PrivateBinPathProbe);

    if (named['import'] == 'none') {
        // add nothing
    } else if (named['import'] == 'standard') {
        // add standard ones only
        cp.ReferencedAssemblies.Add('Accessibility.dll');
        cp.ReferencedAssemblies.Add('System.dll');
        cp.ReferencedAssemblies.Add('System.Drawing.dll');
    } else {
        // add assemblies according to the configuration

        // this works :
        // cp.ReferencedAssemblies.Add('C:\\Users\\tarao\\work\\vmware\\build\\Wnd.dll');

        // this works :
        // cp.ReferencedAssemblies.Add('C:\\Users\\tarao\\work\\vmware\\build\\Wnd\\Wnd.dll');

        // this works with /lib:C:\\Users\\tarao\\work\\vmware\\build\\ :
        // cp.ReferencedAssemblies.Add('Wnd.dll');
        //
        // TODO: support notation of
        //   import Wnd in "lib/Wnd.dll" // JScript
        //   using Wnd in "lib/Wnd.dll"  // C#
        // by copying script.net.exe and lib/Wnd.dll to the same directory,
        // i.e., we have already added the directory of script.net.exe to
        // /lib, only we need is to copy DLL and add the full path of DLL
        // to ReferencedAssemblies. Note: we assume that script.net.exe is
        // located to appropriate place, e.g. C:\Users\xxx\AppData\Local\Temp.

        // this works with /lib:C:\\Users\\tarao\\work\\vmware\\build\\ :
        // cp.ReferencedAssemblies.Add('Wnd\\Wnd.dll');

        var rsp = findCompilerConfiguration();
        if (rsp) {
            var lines = File.ReadAllLines(rsp);
            for (var i=0; i < lines.length; i++) {
                var m = new RegExp('^/r:(.*)$').exec(lines[i]);
                if (m && File.Exists(Path.Combine(getRuntimeDir(), m[1]))) {
                    var file = m[1];
                    cp.ReferencedAssemblies.Add(file);
                }
            }
        }
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
    var res = provider.CompileAssemblyFromFile(cp, [fname]);
    if (0 < res.Errors.Count) {
        for (var i =0; i < res.Errors.Count; i++) {
            Console.Error.WriteLine(res.Errors[i].ToString());
        }
        return;
    }

    var asm = res.CompiledAssembly;
    var method = asm.EntryPoint;
    var params : String[] = args.concat([]);
    method.Invoke(null, [params]);
})();
