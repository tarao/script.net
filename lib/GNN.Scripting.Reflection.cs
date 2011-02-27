using System;
using GNN.Scripting;

namespace GNN.Scripting.Reflection {
  public class FatalError : Exception {
    public FatalError(string msg) : base(msg) {}
  }

  public class RuntimeError : Exception {
    public RuntimeError(string msg) : base(msg) {}
  }

  public interface Impl {
    int create(string klass, object[] para);
    object invoke(string klass, string method, object[] para);
    object invokeI(int id, string method, object[] para);
    object getProp(int id, string prop, object[] index);
    object setProp(int id, string prop, object val, object[] index);
  }

  public class Class {
    public Class(string name, Impl impl) {
      this.name_ = name;
      this.impl = impl;
    }

    public string name {
      get {
        return this.name_;
      }
    }

    public Instance create(params object[] para) {
      try {
        int id = this.impl.create(this.name, para);
        return new Instance(id, this.impl);
      } catch (InvalidOperationException e) {
        throw new FatalError(e.Message);
      } catch (Exception e) {
        var msg = e.Message;
        if (msg.Length == 0) {
          msg = "Invalid constructor " +
            "'" + this.name + "'" +
            " or invalid types of arguments.";
          throw new RuntimeError(msg);
        } else {
          throw new RuntimeError(e.Message);
        }
      }
    }

    public object invoke(string method, params object[] para) {
      try {
        return this.impl.invoke(this.name, method, para);
      } catch (InvalidOperationException e) {
        throw new FatalError(e.Message);
      } catch (Exception e) {
        var msg = e.Message;
        if (msg.Length == 0) {
          msg  = "Invalid method " +
            "'" + this.name + "." + method + "'" +
            " or invalid types of arguments.";
          throw new RuntimeError(msg);
        } else {
          throw new RuntimeError(e.Message);
        }
      }
    }

    private string name_;
    private Impl impl;
  }

  public class Instance {
    public Instance(int id, Impl impl) {
      this.id_ = id;
      this.impl = impl;
    }

    public int id {
      get {
        return this.id_;
      }
    }

    public object invoke(string method, params object[] para) {
      try {
        return this.impl.invokeI(this.id, method, para);
      } catch (InvalidOperationException e) {
        throw new FatalError(e.Message);
      } catch (Exception e) {
        var msg = e.Message;
        if (msg.Length == 0) {
          msg = "Invalid method " +
            "'" + method + "'" +
            " or invalid types of arguments.";
          throw new RuntimeError(msg);
        } else {
          throw new RuntimeError(e.Message);
        }
      }
    }

    public object getProp(string prop, params object[] index) {
      try {
        return this.impl.getProp(this.id, prop, index);
      } catch (InvalidOperationException e) {
        throw new FatalError(e.Message);
      } catch (Exception e) {
        var msg = e.Message;
        if (msg.Length == 0) {
          msg = "Invalid property " +
            "'" + prop + "'" +
            " or invalid indices.";
          throw new RuntimeError(msg);
        } else {
          throw new RuntimeError(e.Message);
        }
      }
    }

    public object setProp(string prop, object val, params object[] index) {
      try {
        return this.impl.setProp(this.id, prop, val, index);
      } catch (InvalidOperationException e) {
        throw new FatalError(e.Message);
      } catch (Exception e) {
        var msg = e.Message;
        if (msg.Length == 0) {
          msg = "Invalid property " +
            "'" + prop + "'" +
            " or invalid indices" +
            " or invalid value.";
          throw new RuntimeError(msg);
        } else {
          throw new RuntimeError(e.Message);
        }
      }
    }

    public object getItem(params object[] index) {
      return this.getProp("Item", index);
    }

    public object setItem(object val, params object[] index) {
      return this.setProp("Item", val, index);
    }

    private int id_;
    private Impl impl;
  }
}
