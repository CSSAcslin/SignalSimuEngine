declare module "elkjs/lib/elk-worker.min.js?worker" {
  class ElkWorker extends Worker {
    constructor(options?: WorkerOptions);
  }
  export default ElkWorker;
}

declare module "elkjs/lib/elk-worker.min.js" {
  export class Worker {
    constructor(url?: string);
  }
}
