/* eslint-disable prefer-arrow-callback, no-var, no-tabs */
$(document).ready(function () {
  // Add specific code to this theme here
    
  window.onscroll = function() {myFunction()};

  var navbar = document.getElementsByClassName("header-area");
  function myFunction() {
    if (window.pageYOffset >= 20) {
      navbar[0].classList.add("sticky")
    } else {
      navbar[0].classList.remove("sticky");
    }
  } 
// Review Input
        $('.reviewinner h4 a').on('click',function(){
          $('.reviewinput').toggleClass('displaynone');
      });



  // slider 1
    if ($('.menu-trigger').length) {
      $(".menu-trigger").on('click', function () {
        $(this).toggleClass('active');
        $('.header-area .nav').slideToggle(200);
      });
    }
  
    
      var width = $(window).width();
      $('.submenu').on('click', function () {
        if (width < 992) {
          if($(this).find('ul').hasClass('active')){
            $('.submenu ul').removeClass('active');
          }
          else{
            $('.submenu ul').removeClass('active');
            $(this).find('ul').toggleClass('active');
          }
        }
      });
   
    var amadoSearch = $('.search-nav');
    var searchClose = $('.search-close');

    amadoSearch.on('click', function () {
        $('body').toggleClass('search-wrapper-on');
        document.getElementById('frm_search').focus();
    });

    searchClose.on('click', function () {
        $('body').removeClass('search-wrapper-on');
    });
  $(".carousel").swipe({

    swipe: function (event, direction, distance, duration, fingerCount, fingerData) {

      if (direction == 'left') $(this).carousel('next');
      if (direction == 'right') $(this).carousel('prev');

    },
    allowPageScroll: "vertical"
  });

  //Product Details image slider
  $('#etalage').etalage({
    smallthumbs_position: 'left',
    thumb_image_width: 320,
    thumb_image_height: 420,
    source_image_width: 900,
    source_image_height: 1100
  });

  $('#etalage1').etalage({
    thumb_image_width: 300,
    thumb_image_height: 250,
  });


  function addBlur() {
    $('#background').addClass('blur');
    $('#content').addClass('blur');
  }

  function removeBlur() {
    $('#background').removeClass('blur');
    $('#content').removeClass('blur');
  }


  $('.password-show').on('click',function(e) {
    e.preventDefault();
    if(e.currentTarget.previousElementSibling.type == 'password'){
      e.currentTarget.previousElementSibling.type = 'text';
    }
    else{
      e.currentTarget.previousElementSibling.type = 'password';
    }
  });
  $(".btn1").on('click', function () {
    $(".form-signin").toggleClass("form-signin-left");
    $(".form-signup").toggleClass("form-signup-left");
    $(".frame").toggleClass("frame-long");
    $(".signup-inactive").toggleClass("signup-active");
    $(".signin-active").toggleClass("signin-inactive");
    $(".forgot").toggleClass("forgot-left");
    $(this).removeClass("idle").addClass("active");
  });

  $(".btn1-signup").on('click', function () {
    $("frame.nav").toggleClass("nav-up");
    $(".form-signup-left").toggleClass("form-signup-down");
    $(".success").toggleClass("success-left");
    $(".frame").toggleClass("frame-short");
  });

  $(".btn1-signin").on('click', function () {
    $(".btn1-animate").toggleClass("btn1-animate-grow");
    $(".welcome").toggleClass("welcome-left");
    $(".cover-photo").toggleClass("cover-photo-down");
    $(".frame").toggleClass("frame-short");
    $(".profile-photo").toggleClass("profile-photo-down");
    $(".btn1-goback").toggleClass("btn1-goback-up");
    $(".forgot").toggleClass("forgot-fade");
  });

  // Product Description Page

  $($('.descheading h3')[0]).addClass('active');
  $('.descproduct .desccont').css('display','none');
  $($('.descproduct .desccont')[0]).css('display','block');
  $('.descheading h3').on('click',function(){
      $('.descheading h3').removeClass('active');
      $(this).addClass('active');
      var index = $('.descheading h3').index(this);
      $('.descproduct .desccont').css('display','none');
      $($('.descproduct .desccont')[index]).css('display','block');
  });
});