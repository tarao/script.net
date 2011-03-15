var WinReg = (function(klass) {
    klass.HK = klass.HKEY = {};
    klass.HK.CR = klass.HKEY.CLASSES_ROOT   = 0x80000000;
    klass.HK.CU = klass.HKEY.CURRENT_USER   = 0x80000001;
    klass.HK.LM = klass.HKEY.LOCAL_MACHINE  = 0x80000002;
    klass.HK.US = klass.HKEY.USERS          = 0x80000003;
    klass.HK.CC = klass.HKEY.CURRENT_CONFIG = 0x80000005;
    return klass;
})(function(host) {
    var loc = WScript.CreateObject('WbemScripting.SWbemLocator');
    var srv = loc.ConnectServer(host || '.', 'root\\default');
    var stdRegProv = srv.Get('StdRegProv');

    var doMethod = function(m, hkey, key, name) {
        var param = stdRegProv.Methods_.Item(m).InParameters.SpawnInstance_();
        param.hDefKey = hkey;
        param.sSubKeyName = key;
        if (name) param.sValueName = name
        return stdRegProv.ExecMethod_(m, param);
    };

    var self = {};

    self.enumKey = function(hkey, key) {
        var out = doMethod('EnumKey', hkey, key);
        var names = []; var types = [];
        if (out.sNames == null) return [];
        return new VBArray(out.sNames).toArray();
    };

    self.enumValues = function(hkey, key) {
        var out = doMethod('EnumValues', hkey, key);
        var names = []; var types = [];
        if (out.sNames != null) names = new VBArray(out.sNames).toArray();
        if (out.Types != null) types = new VBArray(out.Types).toArray();
        var ret = {};
        for (var i=names.length-1; 0<=i; i--) ret[names[i]] = types[i];
        return ret;
    };

    var make = function(method, prop) {
        return function(hkey, key, name) {
            var out = doMethod(method, hkey, key, name);
            return out[prop];
        };
    };

    self.getStringValue = make('GetStringValue', 'sValue');
    self.getExpandedStringValue = make('GetExpandedStringValue', 'sValue');
    self.getDWORDValue = make('GetDWORDValue', 'uValue');

    var resolve = {
        1: self.getStringValue,         // REG_SZ
        2: self.getExpandedStringValue, // REG_EXPAND_SZ
        3: null,                        // REG_BINARY (not implemented)
        4: self.getDWORDValue,          // REG_DWORD
        7: null                         // REG_MULTI_SZ (not implemented)
    };
    self.get = function(hkey, key, name) {
        if (!name) {
            return self.getStringValue(hkey, key);
        } else {
            var t = self.enumValues(hkey, key);
            var nop = function(){ return null; };
            if (t[name]) return (resolve[t[name]]||nop)(hkey, key, name);
        }
    };

    return self;
});
