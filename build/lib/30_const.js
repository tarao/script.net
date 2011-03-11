var SRCDIR = 'build';
var BOOTSTRAP = Path.join(SRCDIR, 'compile.js');

var MODULES = [
    'GNN.Scripting.Util.js',
    'GNN.Scripting.Script.js',
    'GNN.Scripting.Cache.js',
    'GNN.Scripting.Preprocessor.js',
    'GNN.Scripting.Compiler.js',
    'GNN.Scripting.Reflection.cs',
    'GNN.Scripting.Impl.js',
    'GNN.Scripting.js'
].map(function(f) {
    return Path.join('lib', f);
});

var TMPDIR = Path.join(FSO.GetSpecialFolder(2).Path, 'gnn.script.net');
