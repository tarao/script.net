import System;
import System.IO;
import System.Security.Cryptography;
import System.Reflection;

package GNN.Scripting {
    class Util {
        static function hash(str : String) : String {
            var result : String = '';
            var data : byte[] = System.Text.Encoding.UTF8.GetBytes(str);
            var md5 : MD5 = MD5.Create();
            var b : byte[] = md5.ComputeHash(data);
            for (var i : int = 0; i < b.length; i++) {
                result = result + b[i].ToString('x2');
            }
            return result;
        }

        static function assembly() : Assembly {
            return Assembly.GetEntryAssembly() ||
                    Assembly.GetExecutingAssembly();
        }

        static function assemblyDir() : String {
            var asm : Assembly = assembly();
            return asm ? Path.GetDirectoryName(asm.Location) : '';
        }
    }
}
