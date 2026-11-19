package com.brightnexa.leadership;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.JsResult;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;
import com.brightnexa.school.LeadershipLeaveAlerts;

public final class MainActivity extends Activity {
  private static final String HOST="bright-nexa-school-os.onrender.com";
  private WebView web;
  private LeadershipLeaveAlerts leaveAlerts;
  private static boolean trusted(Uri uri){
    return "https".equals(uri.getScheme()) && HOST.equals(uri.getHost());
  }
  @Override public void onCreate(Bundle state){
    super.onCreate(state);
    getWindow().setStatusBarColor(Color.rgb(6,25,49));
    getWindow().setNavigationBarColor(Color.rgb(244,247,252));
    web=new WebView(this);
    setContentView(web);
    WebView.setWebContentsDebuggingEnabled(false);
    WebSettings settings=web.getSettings();
    settings.setJavaScriptEnabled(true);
    settings.setDomStorageEnabled(true);
    settings.setDatabaseEnabled(true);
    settings.setAllowFileAccess(false);
    settings.setAllowContentAccess(false);
    settings.setJavaScriptCanOpenWindowsAutomatically(false);
    settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
    settings.setSupportMultipleWindows(false);
    settings.setSafeBrowsingEnabled(true);
    web.setWebChromeClient(new WebChromeClient(){
      @Override public boolean onJsConfirm(WebView view,String url,String message,JsResult result){
        if(!trusted(Uri.parse(url))){result.cancel();return true;}
        new AlertDialog.Builder(MainActivity.this).setTitle("Bright Nexa")
          .setMessage(message)
          .setPositiveButton("Confirm",(dialog,which)->result.confirm())
          .setNegativeButton("Cancel",(dialog,which)->result.cancel())
          .setOnCancelListener(dialog->result.cancel()).show();
        return true;
      }
      @Override public void onCloseWindow(WebView window){}
    });
    web.setWebViewClient(new WebViewClient(){
      @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request){
        if(trusted(request.getUrl()))return false;
        Uri target=request.getUrl();
        if("https".equals(target.getScheme())){
          try{startActivity(new Intent(Intent.ACTION_VIEW,target));}
          catch(Exception ignored){Toast.makeText(MainActivity.this,"Could not open link",Toast.LENGTH_SHORT).show();}
        }
        return true;
      }
    });
    leaveAlerts=new LeadershipLeaveAlerts(this,web);
    String leaveUrl=LeadershipLeaveAlerts.openUrl(this,getIntent(),false);
    web.loadUrl(leaveUrl==null?"https://"+HOST+"/leadership.html":leaveUrl);
  }
  @Override protected void onNewIntent(Intent intent){
    super.onNewIntent(intent);
    String leaveUrl=LeadershipLeaveAlerts.openUrl(this,intent,false);
    if(leaveUrl!=null&&web!=null)web.loadUrl(leaveUrl);
  }
  @Override public void onRequestPermissionsResult(int code,String[] permissions,int[] results){
    super.onRequestPermissionsResult(code,permissions,results);
    if(leaveAlerts!=null)leaveAlerts.permissionResult(code,results);
  }
  @Override public void onBackPressed(){
    if(web!=null&&web.canGoBack())web.goBack();else super.onBackPressed();
  }
  @Override protected void onDestroy(){
    if(web!=null){web.destroy();web=null;}
    super.onDestroy();
  }
}
