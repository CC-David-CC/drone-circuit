import type {Host} from './view/run.js';

export interface MountResult {
  element: HTMLElement;
  dispose(): void;
}

export function mount(value: unknown, options: {autostart?: boolean} = {}): MountResult {
  const host=value as Host;
  const body=host.ui.make('div','window-content drone-app'),status=host.ui.make('div','app-status','Loading Drone Circuit…');
  body.append(status);
  const controller=new AbortController(),abort=()=>controller.abort(host.signal?.reason||'View removed');
  host.signal?.addEventListener('abort',abort,{once:true});if(host.signal?.aborted)abort();
  let disposed=false,view:{element:HTMLElement;dispose():void}|null=null;
  if(options.autostart!==false)queueMicrotask(()=>{
    void Promise.resolve().then(async()=>{
      if(disposed||controller.signal.aborted)return;
      const {startView}=await import('./view/run.js');
      if(disposed||controller.signal.aborted)return;
      const candidate=await startView(host,controller.signal);
      if(disposed){candidate.dispose();return}
      view=candidate;body.replaceChildren(view.element);
    }).catch(error=>{if(!disposed&&body.isConnected)status.textContent='Could not start Drone Circuit: '+(error instanceof Error?error.message:'unknown error')});
  });
  return{element:body,dispose(){if(disposed)return;disposed=true;host.signal?.removeEventListener('abort',abort);controller.abort('View removed');view?.dispose();view=null;}};
}
