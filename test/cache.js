import System;
import System.IO;
import NUnit.Framework;
import GNN.Scripting;

package GNN.Scripting.Test {
    TestFixture class CacheTest {
        var length : int = 11;
        var o : Object[] = new Object[this.length];
        var c : Cache[] = new Cache[this.length];
        var prefix : String[] = new String[this.length];
        Datapoints var index : int[] = new int[this.length];

        function CacheTest() {
            for (var i : int = 0; i < this.index.length; i++) this.index[i]=i;
        }

        SetUp function Init() {
            var data = [
                [ {},
                  'ee_'
                ],
                [ { input: 'foo' },
                  'ee_'
                ],
                [ { input: 'bar' },
                  'ee_'
                ],
                [ { input: 'foo', file: 'foo' },
                  're_'
                ],
                [ { input: 'foo', target: 'winexe' },
                  'ew_'
                ],
                [ { input: 'foo', target: 'library' },
                  'el_'
                ],
                [ { input: 'foo', target: 'xxx' },
                  'ex_'
                ],
                [ { input: 'foo', debug: true },
                  'eed_'
                ],
                [ { input: 'bar', optimize: true },
                  'eeo_'
                ],
                [ { input: 'foo', fast: true },
                  'eeo_'
                ],
                [ { input: 'foo', file: 'foo',
                    target: 'library', debug: true, fast: true
                  },
                  'rldo_'
                ]
            ];

            for (var i : int = this.length-1; 0 <= i; i--) {
                this.o[i] = data[i][0];
                this.c[i] = new Cache(this.o[i]);
                this.prefix[i] = data[i][1];
            }
        }

        TearDown function Cleanup() {
            for (var i : int = this.c.length-1; 0 <= i; i--) {
                if (File.Exists(this.c[i].file)) File.Delete(this.c[i].file);
                this.c[i] = null;
            }
        }

        Theory function CtorTest(i : int) {
            Assert.That(this.c[i], Is.Not.Null,
                        'Cache.ctor must return non-null value');
        }

        Theory function FileNameTest(i : int) {
            Assert.That(this.c[i].file, Is.Not.Null,
                        'Cache file name must exist');
            Assert.That(this.c[i].file, Is.Not.Empty,
                        'Cache file name must exist');

            Assert.That(this.c[i].file,
                        Is.Not.EqualTo(this.c[(i+1) % this.c.length].file),
                        'Cache file names must be distinct');

            Assert.That(Path.GetFileName(this.c[i].file),
                        Is.StringStarting(this.prefix[i]),
                        'Cache file name must have appropriate prefix');
        }

        Theory function SourceUpdateTest(i : int) {
            var c1 : Cache = this.c[i];
            var fname = c1.file;

            Assert.False(File.Exists(c1.file),
                         'Ctor must not write cache file');
            Assert.True(c1.update(this.o[i].input, {}),
                        'The first update() always returns true');
            Assert.True(File.Exists(c1.file),
                        'Cache update must generate file');

            var c2 : Cache = new Cache(this.o[i]);
            Assert.False(c2.update(this.o[i].input, {}),
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
        }

        Theory function OptionUpdateTest(i : int) {
            var s = 'hogehoge';
            var o = this.o[i];
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

            o.file = this.o[i].file ? this.o[i].file+'a' : 'foo';
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
                        'Cache file name does not change during ' +
                        'modification');
        }
    }
}
