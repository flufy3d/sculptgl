define([
  'gui/tr/english',
  'gui/tr/chinese',
  'gui/tr/japan',
  'gui/tr/korean',
], function (english, chinese, japan, korean) {

  'use strict';

  var GuiTR = function (key) {
    var str = GuiTR.languages[GuiTR.select][key];
    if (typeof str === 'string')
      return str;
    if (typeof str === 'function')
      return str.apply(this, Array.prototype.slice.call(arguments, 1));
    return key;
  };

  GuiTR.languages = {
    'english': english,
    '日本語': japan,
    '中文': chinese,
    '한국어' : korean
  };

  GuiTR.select = 'english';
  var language = window.navigator.language || window.navigator.userLanguage;
  if (language) language = language.substr(0, 2);
  if (language === 'ja') GuiTR.select = '日本語';
  else if (language === 'zh') GuiTR.select = '中文';
  else if (language === 'ko') GuiTR.select = '한국어';

  return GuiTR;
});