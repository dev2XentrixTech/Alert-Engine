function replaceSpaceByPlus(str) {
    return str.replace(/ /g, '+');
}

function encryptData(str) {
    let result = '';
    str = str.toString();

    for (let i = 0; i < str.length; i++) {
        const charCode = str.charCodeAt(i);

        const keyIndex = (i % process.env.ENC_DEC_KEY.length) - 1;
        const fixedIndex = keyIndex < 0 ? process.env.ENC_DEC_KEY.length - 1 : keyIndex;

        const keyCode = process.env.ENC_DEC_KEY.charCodeAt(fixedIndex);

        const newChar = String.fromCharCode(charCode + keyCode);
        result += newChar;
    }

    return btoa(result); 
}

function decryptData(str) {
    let result = '';
    str = atob(replaceSpaceByPlus(str)); 

    for (let i = 0; i < str.length; i++) {
        const charCode = str.charCodeAt(i);

        const keyIndex = (i % process.env.ENC_DEC_KEY.length) - 1;
        const fixedIndex = keyIndex < 0 ? process.env.ENC_DEC_KEY.length - 1 : keyIndex;

        const keyCode = process.env.ENC_DEC_KEY.charCodeAt(fixedIndex);

        const newChar = String.fromCharCode(charCode - keyCode);
        result += newChar;
    }

    return result;
}


module.exports = {
    encryptData,
    decryptData
};
