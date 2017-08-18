import { default as $ } from 'jquery';
import { default as blockies } from 'blockies';
import { default as toastr } from 'toastr';

export default class DirectoryCached {

  constructor(directoryContract) {
    this._cache = {}
    this._directoryContract = directoryContract
  }

  async memberName(address) {
    
    if (address in this._cache) {
      return this._cache[address];
    }

    let name = await this._directoryContract.getName(address)

    if (name == "") {
      name = address.substring(2,8)
    }

    this._cache[address] = name
    return name;

  }

  invalidate(address) {

    if (address in this._cache) {
      delete this._cache[address]
    }
  }

  memberIcon(address, scale) {

    const icon = blockies({ // All options are optional
      seed: address, // seed used to generate icon data, default: random
      size: 8, // width/height of the icon in blocks, default: 8
      scale: scale, // width/height of each block in pixels, default: 4
      spotcolor: '#000', // each pixel has a 13% chance of being of a third color, 
      bgcolor: '#ECF0F1'
    });

    icon.addEventListener('click', () => {
      $("#copyTarget").css("display","block");
      $("#copyTarget").attr("value",address);
      $("#copyTarget").select()
      $("#copyTarget")[0].setSelectionRange(0,address.length)
      document.execCommand('copy');
      $("#copyTarget").css("display","none");
      toastr.info('Address copied to clipboard');
    }, false);

    return $(icon);
  }

   async embedMemberIcon(address, element, clickUrl) {
    const name = await this.memberName(address);

    element.html('');
    const e = $("<div>")
    e.attr("class","blockymember");
    e.append(this.memberIcon(address,4).attr("class","blocky"))
    if (clickUrl !== undefined) {
      e.append($("<div>").html("<a href='"+clickUrl+"'>"+name+"</a>"))
    } else {
      e.append($("<div>").html(name))
    }
    element.append(e)
  }

}
