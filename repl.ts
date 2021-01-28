import {run} from "./runner";
import {emptyEnv, GlobalEnv, FuncType} from "./compiler";
import { Type } from "./ast";

interface REPL {
  run(source : string) : Promise<any>;
}

export class BasicREPL {
  currentEnv: GlobalEnv
  importObject: any
  memory: any
  constructor(importObject : any) {
    this.importObject = importObject;
    /*
    if(!importObject.js) {
      const memory = new WebAssembly.Memory({initial:10, maximum:20});
      this.importObject.js = { memory: memory };
    }
    */
    //
    var emptyFuncs = new Map<String, FuncType>();
    emptyFuncs.set("print", {"paramTypes": [Type.any], "retType": Type.none, "index": -1});
    emptyFuncs.set("globals", {"paramTypes": [Type.int, Type.int], "retType": Type.none, "index": -1});
    //
    this.currentEnv = {
      globals: new Map(),
      funcs: emptyFuncs,
      offset: 0,
      funcIndex: 0
    };
  }
  async run(source : string) : Promise<any> {
    this.importObject.updateNameMap(this.currentEnv); // is this the right place for updating the object's env?
    const [result, newEnv] = await run(source, {importObject: this.importObject, env: this.currentEnv});
    this.currentEnv = newEnv;
    return result;
  }
}