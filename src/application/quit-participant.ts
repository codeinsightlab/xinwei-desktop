export interface QuitPorts {
  wait:()=>Promise<void>; dirty:()=>boolean; freeze:(id:number|undefined,preparing:boolean)=>void;
  ready:(id:number,dirty:boolean)=>Promise<void>; review:(id:number)=>void;
  resolve:(id:number)=>Promise<void>; cancel:(id:number,message?:string)=>Promise<void>;
}
/** One local participant in the native application's single quit transaction. */
export class QuitParticipant {
  private id?:number;
  private reviewing=false;
  private approval?:Promise<void>;
  constructor(private ports:QuitPorts){}
  async prepare(id:number){
    if(this.id===id)return;this.id=id;this.reviewing=false;this.approval=undefined;this.ports.freeze(id,true);
    try{await this.ports.wait();if(this.id===id)await this.ports.ready(id,this.ports.dirty());}
    catch(error){if(this.id===id)await this.cancel(String(error));}
  }
  review(id:number){if(this.id!==id || this.reviewing)return;this.reviewing=true;this.ports.freeze(id,false);this.ports.review(id);}
  approve():Promise<void>{const id=this.id;if(id===undefined)return Promise.resolve();if(this.approval)return this.approval;
    this.ports.freeze(id,true);
    this.approval=(async()=>{try{await this.ports.wait();if(this.id===id)await this.ports.resolve(id);}
    catch(error){await this.cancel(String(error));throw error;}})();return this.approval;
  }
  async cancel(message?:string){const id=this.id;if(id===undefined)return;try{await this.ports.cancel(id,message);}finally{this.release(id);}}
  release(id:number){if(this.id!==id)return;this.id=undefined;this.reviewing=false;this.approval=undefined;this.ports.freeze(undefined,false);}
}
