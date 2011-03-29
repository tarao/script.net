import System;
import NUnit.Framework;
import GNN.Scripting;

package GNN.Scripting.Test {
    TestFixture class UtilTest {
        Test function HashTest() {
            var s1 = 'foobar';
            var s2 = 'foobar';
            var s3 = 'hogefoobartarao';
            var s4 = 'hogefoobartarap';

            Assert.IsNotEmpty(Util.hash(s1), 'hash() returns non-empty value');
            Assert.True(Util.hash(s1) == Util.hash(s2),
                        'hash() returns the same value for the same string');
            Assert.True(Util.hash(s1) == Util.hash(s2),
                        'hash() returns the same value for the same string');
            Assert.False(Util.hash(s2) == Util.hash(s3),
                         'hash() returns distinct values ' +
                         'for distinct strings');
            Assert.False(Util.hash(s3) == Util.hash(s4),
                         'hash() returns distinct values ' +
                         'for similar strings');
        }

        Test function ArchTest() {
            Assert.IsNotEmpty(Util.arch(),
                              'arch() returns non-empty string');
            Assert.True(/\d+/.test(Util.arch()),
                        'arch() returns numeric text');
        }
    }
}
