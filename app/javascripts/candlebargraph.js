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
    this._canvas = canvas
    this._scaling = 2.0

    this._font =  (10*this._scaling) + "px Arial"
    this._candlewidth = 8 * this._scaling

    this._canvas.style.width = (this._canvas.width) + "px";
    this._canvas.style.height = (this._canvas.height) + "px";
    this._canvas.width = this._canvas.width * this._scaling
    this._canvas.height = this._canvas.height * this._scaling

    this._ctx = this._canvas.getContext('2d');

  }

  async invalidate ( startTime, endTime, step ) {

    let self = this
 
    this._startTime = startTime
    this._endTime = endTime 

    const url = 'https://poloniex.com/public?command=returnChartData&currencyPair=USDT_ETH&start='+this._startTime+'&end='+this._endTime+'&period='+step

    const data = await Helper.httpGetPromise(url)
    await this.paint(JSON.parse(data))

  }

  async paint( data ) {

    let self = this

    this._hiValue = data[0].high
    this._loValue = data[0].low

    for (let c=1;c<data.length;c++) {
        if (data[c].high > this._hiValue) this._hiValue=data[c].high;
        if (data[c].low < this._loValue) this._loValue=data[c].low;
    }

    let m_margin = 50
    this._hiValue = this._hiValue + m_margin;
    this._loValue = this._loValue - m_margin;

    this._scaleTime  = 
       ( this._endTime- this._startTime ) /  this._canvas.width;
    
    this._scaleValue = 
       ( this._hiValue - this._loValue) /  this._canvas.height;

    this._ctx.font = this.FONT;

    for (let c=0;c<data.length;c++) {

        if ( c > 0 && c % 4 == 0 ) {
          this.drawTimeGrid(data[c].date,CandlebarGraph.GRIDCOLOR)
        }
        console.log(data[c].high)
        const x = (data[c].date - this._startTime) / this._scaleTime

        const y_high = this._canvas.height - (data[c].high - this._loValue) / this._scaleValue
        const y_low = this._canvas.height - (data[c].low - this._loValue) / this._scaleValue
        const y_open = this._canvas.height - (data[c].open - this._loValue) / this._scaleValue
        const y_close = this._canvas.height - (data[c].close - this._loValue) / this._scaleValue

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

        if (data[c].open >= data[c].close) {
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