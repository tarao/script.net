import System;
import System.IO;
import NUnit.Framework;
import GNN.Scripting;

package GNN.Scripting.Test {
    TestFixture class CacheTest {
        Test function CtorTest() {
            Assert.NotNull(new Cache({}),
                           'Cache.ctor must return non-null value');
        }

        Test function FileNameTest() {
            var c1 : Cache = new Cache({});
            var c2 : Cache = new Cache({ input: 'foo' });
            var c3 : Cache = new Cache({ input: 'bar' });

            Assert.NotNull(c1.file, 'Cache file name must exist');
            Assert.IsNotEmpty(c1.file, 'Cache file name must exist');
            Assert.NotNull(c2.file, 'Cache file name must exist');
            Assert.IsNotEmpty(c2.file, 'Cache file name must exist');
            Assert.NotNull(c3.file, 'Cache file name must exist');
            Assert.IsNotEmpty(c3.file, 'Cache file name must exist');
        }

        Test function DistinctFileNameTest() {
            var c1 : Cache = new Cache({});
            var c2 : Cache = new Cache({ input: 'foo' });
            var c3 : Cache = new Cache({ input: 'bar' });

            Assert.AreNotEqual(c1.file, c2.file,
                               'Cache file names must be distinct');
            Assert.AreNotEqual(c2.file, c3.file,
                               'Cache file names must be distinct');
            Assert.AreNotEqual(c3.file, c1.file,
                               'Cache file names must be distinct');
        }

        Test function FileNameSpecTest() {
            var c1 : Cache = new Cache({ input: 'foo' });
            var c2 : Cache = new Cache({ input: 'foo', file: 'foo' });
            var c3 : Cache = new Cache({ input: 'foo', target: 'winexe' });
            var c4 : Cache = new Cache({ input: 'foo', target: 'library' });
            var c5 : Cache = new Cache({ input: 'foo', target: 'xxx' });
            var c6 : Cache = new Cache({ input: 'foo', debug: true });
            var c7 : Cache = new Cache({ input: 'foo', optimize: true });
            var c8 : Cache = new Cache({ input: 'foo', fast: true });
            var c9 : Cache = new Cache({
                input: 'foo', file: 'foo',
                target: 'library', debug: true, fast: true
            });

            var msg = 'Cache file name must have prefix';
            StringAssert.StartsWith('ee_', Path.GetFileName(c1.file), msg);
            StringAssert.StartsWith('re_', Path.GetFileName(c2.file), msg);
            StringAssert.StartsWith('ew_', Path.GetFileName(c3.file), msg);
            StringAssert.StartsWith('el_', Path.GetFileName(c4.file), msg);
            StringAssert.StartsWith('ex_', Path.GetFileName(c5.file), msg);
            StringAssert.StartsWith('eed_', Path.GetFileName(c6.file), msg);
            StringAssert.StartsWith('eeo_', Path.GetFileName(c7.file), msg);
            StringAssert.StartsWith('eeo_', Path.GetFileName(c8.file), msg);
            StringAssert.StartsWith('rldo_', Path.GetFileName(c9.file), msg);
        }

        Test function SourceUpdateTest() {
            var c1 : Cache = new Cache({ input: 'foo' });
            var fname = c1.file;

            Assert.False(File.Exists(c1.file),
                         'Ctor must not write cache file');
            Assert.True(c1.update('foo', {}),
                        'The first update() always returns true');
            Assert.True(File.Exists(c1.file),
                        'Cache update must generate file');

            var c2 : Cache = new Cache({ input: 'foo' });
            Assert.False(c2.update('foo', {}),
                         'The first update() with the same source returns ' +
                         'false if cache file already exist');
            Assert.AreEqual(c1.file, c2.file,
                            'The same cache file name for the same source');

            Assert.True(c1.update('hogehoge', {}),
                        'Modification of source must update cache');
            Assert.False(c1.update('hogehoge', {}),
                         'No update after update() returned true');
            Assert.False(c1.update('hogehoge', {}),
                         'No update after update() returned false');

            Assert.AreEqual(fname, c1.file,
                            'Cache file name does not change during '+
                            'modification');

            if (File.Exists(c1.file)) File.Delete(c1.file);
            if (File.Exists(c2.file)) File.Delete(c2.file);
        }

        Test function OptionUpdateTest() {
            var s = 'hogehoge';
            var o = { input: 'foo' };
            var c1 : Cache = new Cache(o);
            var fname = c1.file;

            Assert.False(File.Exists(c1.file),
                         'Ctor must not write cache file');
            Assert.True(c1.update(s, o),
                        'The first update() always returns true');
            Assert.False(c1.update(s, o),
                         'No update after update() returned true');

            var c2 : Cache = new Cache(o);
            Assert.False(c2.update(s, o),
                         'The first update() with the same source returns ' +
                         'false if cache file already exist');

            o.file = 'foo';
            Assert.True(c1.update(s, o),
                        'Option [file] affects cache modification');
            o.debug = true;
            Assert.False(c1.update(s, o),
                         'Other option does not affect cache modification' +
                        ' [debug]');
            o.hash = 'aaa';
            Assert.False(c1.update(s, o),
                         'Other option does not affect cache modification' +
                        ' [hash]');

            Assert.AreEqual(fname, c1.file,
                            'Cache file name does not change during '+
                            'modification');

            var c3 : Cache = new Cache(o);
            Assert.AreNotEqual(c1.file, c3.file,
                               'Changing [file] option generates different '+
                               'file for new cache object');

            if (File.Exists(fname)) File.Delete(fname);
            if (File.Exists(c1.file)) File.Delete(c1.file);
            if (File.Exists(c2.file)) File.Delete(c2.file);
            if (File.Exists(c3.file)) File.Delete(c3.file);
        }
    }
}
