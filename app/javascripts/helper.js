import { default as $ } from 'jquery';

export default class Helper {  

   static getTransactionReceiptMined(txnHash, interval) {
      var self = this;

      var transactionReceiptAsync;
      interval = interval ? interval : 500;
      transactionReceiptAsync = function(txnHash, resolve, reject) {
          try {
              web3.eth.getTransactionReceipt(txnHash, (_,receipt) => {
                  if (receipt == null || receipt.blockNumber == null ) {
                      setTimeout(function () {
                          transactionReceiptAsync(txnHash, resolve, reject);
                      }, interval);
                  } else {
                      console.log(receipt);
                      resolve(receipt);
                  }
              });
          } catch(e) {
              reject(e);
          }
      };

      if (Array.isArray(txnHash)) {
          var promises = [];
          txnHash.forEach(function (oneTxHash) {
              promises.push(self.getTransactionReceiptMined(oneTxHash, interval));
          });
          return Promise.all(promises);
      } else {
          return new Promise(function (resolve, reject) {
                  transactionReceiptAsync(txnHash, resolve, reject);
              });
      }
  }

  static formatEth(v) {
    return web3.toBigNumber(v).div(web3.toWei(1,'finney'))/1000
  }

  static formatAddr(addr) {
    return "<a href=https://etherscan.io/address/"+addr+" target="+addr+">"+addr+"</a>";
  }

  static formatTrn(txn) {
    return "<a href=https://etherscan.io/tx/"+txn+" target="+txn+">"+txn+"</a>";
  }

  static formatTimeDiff(diff) {
    
     const d = diff / (24*3600) ; diff = diff%(24*3600)
     const h = diff / (3600) ; diff = diff % 3600
     const m = diff / (60)
     const s = diff % 60

     const pad = function (v) {
        v = Math.floor(v);
        if (v>9) return ""+v;
        return "0"+v;
     }

     if (d>0) {
       return pad(d)+"d"+pad(h)+"h"+pad(m)+"m";
     } else {
       return pad(h)+"h"+pad(m)+"m"; 
     }
  }

  static removeTableRows(table) {
     let rows = table.rows.length
     while (rows > 1)  {
        table.deleteRow(rows-1);
        rows--;
     }
  }

  static addTableRow(table, cols, directoryCached) {

    const tr = $("<tr>");
    table.append(tr);
    for (let c=0;c<cols.length;c++) {

      const td = $("<td>")
      tr.append(td)

      if (cols[c].toString().startsWith("member:")) {
      
        let [k,v] = cols[c].split(":");
        directoryCached.embedMemberIcon(v,td)
      
      } else {
        td.html(cols[c])
      }
    }
  }

  static httpGetPromise(url) {
    // Return a new promise.
    return new Promise(function(resolve, reject) {
      // Do the usual XHR stuff
      var req = new XMLHttpRequest();
      req.open('GET', url);

      req.onload = function() {
        // This is called even on 404 etc
        // so check the status
        if (req.status == 200) {
          // Resolve the promise with the response text
          resolve(req.response);
        }
        else {
          // Otherwise reject with the status text
          // which will hopefully be a meaningful error
          reject(Error(req.statusText));
        }
      };

      // Handle network errors
      req.onerror = function() {
        reject(Error("Network Error"));
      };

      // Make the request
      req.send();
    });
  }
}
