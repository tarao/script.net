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
