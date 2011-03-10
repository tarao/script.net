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
