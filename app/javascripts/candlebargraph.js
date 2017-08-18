import { default as $ } from 'jquery';
import { default as Helper } from './helper.js';

export default class CandlebarGraph {

  get FONT() { return this._font; }
  get CANDLEWIDTH() { return this._candlewidth; }
  static get REDCOLOR() { return "#FE2E2E"; }
  static get GREENCOLOR() { return "#2EFE2E"; }
  static get GRIDCOLOR() { return '#dddddd'; }
  static get TARGETCOLOR() { return '#0000FF'; }

  constructor(canvas) {

    let self = this

    this._canvas = canvas
    this._scaling = 2.0

    this._font =  (10*this._scaling) + "px Arial"
    this._candlewidth = 8 * this._scaling

    this._canvas.style.width = (this._canvas.width) + "px";
    this._canvas.style.height = (this._canvas.height) + "px";
    this._canvas.width = this._canvas.width * this._scaling
    this._canvas.height = this._canvas.height * this._scaling

    this._ctx = this._canvas.getContext('2d');

    this._margin = 0

    this._canvas.addEventListener('mousemove', function(e) {

      let y = self._canvas.height - (e.pageY - self._canvas.offsetTop)*self._scaling;
      let v = y*self._scaleValue + self._loValue
      v = Math.round(v * 100) / 100
 
      self._ctx.fillStyle = '#fff';
      self._ctx.fillRect(0,0, 100, 25);
      self._ctx.fillStyle = '#000';
      self._ctx.font = 'bold 20px arial';
      self._ctx.fillText(v, 0, 20, 100);

    }, 0);

    this._canvas.onmousedown = function(e) {

      let y = self._canvas.height - (e.pageY - self._canvas.offsetTop)*self._scaling;

      if (y > self._canvas.height / 2 ) self._margin++;
      else self._margin--;
      self.paint()

    };

  }

  async invalidate ( startTime, endTime, step ) {

    let self = this
 
    this._startTime = startTime
    this._endTime = endTime 
    this._bets = []
    this._betTime = 0

    const url = 'https://poloniex.com/public?command=returnChartData&currencyPair=USDT_ETH&start='+this._startTime+'&end='+this._endTime+'&period='+step

    this._data = JSON.parse(await Helper.httpGetPromise(url))
    await this.paint()

  }

  async paint( ) {

    let self = this

    this._ctx.fillStyle = '#ffffff';
    this._ctx.fillRect(
       0,0,
       this._canvas.width,this._canvas.height
    );

    this._hiValue = this._data[0].high
    this._loValue = this._data[0].low

    for (let c=1;c<this._data.length;c++) {
      const sample = this._data[c]
      if (sample.high > this._hiValue) this._hiValue=sample.high;
      if (sample.low < this._loValue) this._loValue=sample.low;
    }

    this._hiValue = this._hiValue + this._margin;
    this._loValue = this._loValue - this._margin;

    this._scaleTime  = 
       ( this._endTime- this._startTime ) /  this._canvas.width;
    
    this._scaleValue = 
       ( this._hiValue - this._loValue) /  this._canvas.height;

    this._ctx.font = this.FONT;

    for (let c=0;c<this._data.length;c++) {

        const sample = this._data[c]

        if ( c > 0 && c % 4 == 0 ) {
          this.drawTimeGrid(sample.date,CandlebarGraph.GRIDCOLOR)
        }

        const x = (sample.date - this._startTime) / this._scaleTime

        const y_high = this._canvas.height - (sample.high - this._loValue) / this._scaleValue
        const y_low = this._canvas.height - (sample.low - this._loValue) / this._scaleValue
        const y_open = this._canvas.height - (sample.open - this._loValue) / this._scaleValue
        const y_close = this._canvas.height - (sample.close - this._loValue) / this._scaleValue

        this._ctx.beginPath();
        this._ctx.setLineDash([5, 0]);
        this._ctx.strokeStyle = '#222222';
        this._ctx.moveTo(x,y_high);
        this._ctx.lineTo(x,y_low);
        this._ctx.stroke();
        this._ctx.moveTo(x-this.CANDLEWIDTH/2,y_high);
        this._ctx.lineTo(x+this.CANDLEWIDTH/2,y_high);
        this._ctx.stroke();
        this._ctx.moveTo(x-this.CANDLEWIDTH/2,y_low);
        this._ctx.lineTo(x+this.CANDLEWIDTH/2,y_low);
        this._ctx.stroke();

        if (sample.open >= sample.close) {
           this._ctx.fillStyle = CandlebarGraph.GREENCOLOR;
           this._ctx.fillRect(
              x-this.CANDLEWIDTH/2,y_close,
              this.CANDLEWIDTH,y_open-y_close+1
          );
        } else {
           this._ctx.fillStyle = CandlebarGraph.REDCOLOR;
           this._ctx.fillRect(
              x-this.CANDLEWIDTH/2,y_open,
              this.CANDLEWIDTH,y_close-y_open+1
           );
        }
    }

    this.drawTimeGrid(this._betTime,CandlebarGraph.TARGETCOLOR)

    for (let c = 0; c<this._bets.length;c++) {
       this.drawBet(this._bets[c].t,this._bets[c].v)    
    }

  }

  setBetTime(t) {
    this._betTime = t
    this.drawTimeGrid(t,CandlebarGraph.TARGETCOLOR)
  }

  addBet(t, v) {
    this._bets.push({t:t,v:v})
    this.drawBet(t,v)
  }

  drawTimeGrid(t, color) {

    const x = (t - this._startTime) / this._scaleTime

    this._ctx.beginPath();
    this._ctx.setLineDash([5, 3]);
    this._ctx.strokeStyle = color;
    this._ctx.moveTo(x,0);
    this._ctx.lineTo(x,this._canvas.height);
    this._ctx.stroke();

    this._ctx.fillStyle = "#000000";
    var date = new Date(t*1000);
    this._ctx.fillText(date.getDate()+" "+date.getHours()+"h",x,this._canvas.height-10);

  }


  drawBet(t, v) {

    const x = (t - this._startTime) / this._scaleTime
    const y = this._canvas.height - (v - this._loValue) / this._scaleValue

    this._ctx.beginPath();
    this._ctx.arc(x, y, 3, 0, 2 * Math.PI, false);
    this._ctx.fillStyle = '#000';
    this._ctx.fill();

  }

}