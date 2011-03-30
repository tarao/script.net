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

            Assert.That(Util.hash(s1), Is.Not.Empty,
                        'hash() returns non-empty value');
            Assert.That(Util.hash(s1), Is.EqualTo(Util.hash(s2)),
                        'hash() returns the same value for the same string');
            Assert.That(Util.hash(s1), Is.EqualTo(Util.hash(s2)),
                        'hash() returns the same value for the same string');
            Assert.That(Util.hash(s2), Is.Not.EqualTo(Util.hash(s3)),
                        'hash() returns distinct values for distinct strings');
            Assert.That(Util.hash(s3), Is.Not.EqualTo(Util.hash(s4)),
                        'hash() returns distinct values for similar strings');
        }

        Test function ArchTest() {
            Assert.That(Util.arch(), Is.Not.Empty,
                        'arch() returns non-empty string');
            Assert.That(Util.arch(), Is.StringMatching('\\d+'),
                        'arch() returns numeric text');
        }
    }
}
