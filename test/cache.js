import System;
import System.IO;
import NUnit.Framework;
import GNN.Scripting;

package GNN.Scripting.Test {
    TestFixture class CacheTest {
        Test function CtorTest() {
            Assert.That(new Cache({}), Is.Not.Null,
                        'Cache.ctor must return non-null value');
        }

        Test function FileNameTest() {
            var c1 : Cache = new Cache({});
            var c2 : Cache = new Cache({ input: 'foo' });
            var c3 : Cache = new Cache({ input: 'bar' });

            Assert.That(c1.file, Is.Not.Null, 'Cache file name must exist');
            Assert.That(c1.file, Is.Not.Empty, 'Cache file name must exist');
            Assert.That(c2.file, Is.Not.Null, 'Cache file name must exist');
            Assert.That(c2.file, Is.Not.Empty, 'Cache file name must exist');
            Assert.That(c3.file, Is.Not.Null, 'Cache file name must exist');
            Assert.That(c3.file, Is.Not.Empty, 'Cache file name must exist');
        }

        Test function DistinctFileNameTest() {
            var c1 : Cache = new Cache({});
            var c2 : Cache = new Cache({ input: 'foo' });
            var c3 : Cache = new Cache({ input: 'bar' });

            Assert.That(c1.file, Is.Not.EqualTo(c2.file),
                        'Cache file names must be distinct');
            Assert.That(c2.file, Is.Not.EqualTo(c3.file),
                        'Cache file names must be distinct');
            Assert.That(c3.file, Is.Not.EqualTo(c1.file),
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
            Assert.That(Path.GetFileName(c1.file), Is.StringStarting('ee_'),
                        msg);
            Assert.That(Path.GetFileName(c2.file), Is.StringStarting('re_'),
                        msg);
            Assert.That(Path.GetFileName(c3.file), Is.StringStarting('ew_'),
                        msg);
            Assert.That(Path.GetFileName(c4.file), Is.StringStarting('el_'),
                        msg);
            Assert.That(Path.GetFileName(c5.file), Is.StringStarting('ex_'),
                        msg);
            Assert.That(Path.GetFileName(c6.file), Is.StringStarting('eed_'),
                        msg);
            Assert.That(Path.GetFileName(c7.file), Is.StringStarting('eeo_'),
                        msg);
            Assert.That(Path.GetFileName(c8.file), Is.StringStarting('eeo_'),
                        msg);
            Assert.That(Path.GetFileName(c9.file), Is.StringStarting('rldo_'),
                        msg);
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
            Assert.That(c1.file, Is.EqualTo(c2.file),
                        'The same cache file name for the same source');

            Assert.True(c1.update('hogehoge', {}),
                        'Modification of source must update cache');
            Assert.False(c1.update('hogehoge', {}),
                         'No update after update() returned true');
            Assert.False(c1.update('hogehoge', {}),
                         'No update after update() returned false');

            Assert.That(c1.file, Is.EqualTo(fname),
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

            Assert.That(c1.file, Is.EqualTo(fname),
                        'Cache file name does not change during '+
                        'modification');

            var c3 : Cache = new Cache(o);
            Assert.That(c1.file, Is.Not.EqualTo(c3.file),
                        'Changing [file] option generates different '+
                        'file for new cache object');

            if (File.Exists(fname)) File.Delete(fname);
            if (File.Exists(c1.file)) File.Delete(c1.file);
            if (File.Exists(c2.file)) File.Delete(c2.file);
            if (File.Exists(c3.file)) File.Delete(c3.file);
        }
    }
}
