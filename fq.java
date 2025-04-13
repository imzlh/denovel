package com.dragon.read.hybrid;

import android.content.Context;
import android.net.Uri;
import android.text.TextUtils;
import com.bytedance.article.common.utils.c;
import com.bytedance.common.utility.StringUtils;
import com.bytedance.covode.number.Covode;
import com.dragon.read.NsUtilsDepend;
import com.dragon.read.app.App;
import com.dragon.read.base.ssconfig.SsConfigMgr;
import com.dragon.read.base.ssconfig.interfaces.IWebUrlConfig;
import com.dragon.read.base.ssconfig.model.ob;
import com.dragon.read.base.util.JSONUtils;
import com.dragon.read.base.util.LogWrapper;
import com.dragon.read.hybrid.webview.utils.c;
import com.dragon.read.report.PageRecorder;
import com.dragon.read.router.b;
import com.dragon.read.user.model.i;
import java.io.UnsupportedEncodingException;
import java.net.URLEncoder;
import java.util.HashMap;
import java.util.Set;

public class WebUrlManager {
  private static final String QUERY_DOUYIN_AUTH_TITLE;
  
  private static final String QUERY_DOUYIN_POLICY_TITLE;
  
  private static final String QUERY_DOUYIN_PROTOCOL_TITLE;
  
  private static volatile WebUrlManager instance;
  
  private final String TARGET_USER_FANS_PAGE_URL;
  
  private final String TARGET_USER_FOLLOW_PAGE_URL;
  
  final String activityTopicEditorUrl;
  
  final String advertisingControlDefaultUrl;
  
  final String agreementDefaultUrl;
  
  final String appealUrl;
  
  final String authorAgreement;
  
  final String authorCentre;
  
  final String authorPCAgreement;
  
  final String authorPCPrivacy;
  
  final String authorPopularityRankUrl;
  
  final String authorPrivacy;
  
  final String basicDataUsageUrl;
  
  final String basicFunctionSwitchUrl;
  
  final String becomeWriter;
  
  final String blackHouse;
  
  final String bookCoinUrl;
  
  final String bookCommentEditorUrl;
  
  final String bookCommentGuideUrl;
  
  final String bookListEditorJs;
  
  final String bookPraiseRankUrl;
  
  final String bookStoreTopicLandingPageToBookList;
  
  final String bookUploadHtmlZipUrl;
  
  final String bookWikiUrl;
  
  final String catalogSimilarBookListUrl;
  
  final String changduuPayWallUrl;
  
  final String chapterEndDefaultUrl;
  
  final String childrenMessageProtectUrl;
  
  final String clockInHelp;
  
  final String closeAccountUrl;
  
  final String coinBuyBookUrl;
  
  final String communityChangduSaaSMessageEntryUrl;
  
  final String communityConventionUrl;
  
  final String communityEggFlowerSaaSMessageEntryUrl;
  
  final String communityHongguoSaaSMessageEntryUrl;
  
  final String communitySaaSMessageEntryUrl;
  
  final String contractEntrance;
  
  final String creationIncomePageUrl;
  
  final String csjShakeSettingDefaultUrl;
  
  final String csrEntranceDefaultDebugUrl;
  
  final String csrEntranceDefaultUrl;
  
  final String customerServiceUrl;
  
  private final String defaultReaderAiInfoUrl;
  
  private final String defaultReaderAiLynxUrl;
  
  private final String douyinMonthlyPayUrl;
  
  final String douyinPrivacyPolicyUrl;
  
  final String douyinPrivacyUrl;
  
  final String douyinUserProtocolUrl;
  
  private final String douyinWalletUrl;
  
  final String ecomSearchPageCardUrl;
  
  final String ecomSearchUrl;
  
  final String eggFlowerPayWallUrl;
  
  final String fanGroupsUrl;
  
  final String fansDescription;
  
  final String fansRank;
  
  final String faqDefaultUrl;
  
  final String feedbackDefaultUrl;
  
  final String feedbackEntryUrl;
  
  final String followUrl;
  
  final String forumOperatorDetail;
  
  final String forwardEditorUrl;
  
  final String giftRecordPageUrl;
  
  final String graphicPrivacyDefaultUrl;
  
  final String helpDefaultUrl;
  
  final String hotReadBookUrl;
  
  private final String imRobotAIList;
  
  final String imRobotDetailPiaUrl;
  
  final String imRobotDetailUrl;
  
  final String imRobotListUrl;
  
  private final String imScriptDetailUrl;
  
  final String inviteAnswerListUrl;
  
  final String inviteAnswerUrl;
  
  final String licenseDefaultUrl;
  
  final String mineVipBannerPageUrl;
  
  final String mixMallBookChannelUrl;
  
  final String multiDeviceManageUrl;
  
  final String muteManageUrl;
  
  final String myFollow;
  
  final String myMessageEntryUrl;
  
  final String myOrderLynxUrl;
  
  final String myOrderUrl;
  
  final String myPublish;
  
  final String myTabMallIndependentLynxDefaultUrl;
  
  final String myTabMallIndependentLynxDefaultUrlNew;
  
  final String newGiftAgreementUrl;
  
  final String operationEntry;
  
  final String payWallLynxUrl;
  
  final String payingAttentionUrl;
  
  final String permissionListUrl;
  
  final String personalInfoListUrl;
  
  final String personalInformationUrl;
  
  final String personalRankingUrl;
  
  final String personalRecommendDefaultUrl;
  
  final String postFeedbackDefaultUrl;
  
  final String privacyDefaultUrl;
  
  String rankPageUrl;
  
  final String registerAgreementDefaultUrl;
  
  final String reqBookTopicDetail;
  
  final String rewardRank;
  
  final String rewardRankRule;
  
  final String rewardRule;
  
  final String rewardWall;
  
  private final String saasBookCommentEditorUrl;
  
  private final String searchRecBookRobotUsage;
  
  final String searchTopicTabLynxUrl;
  
  final String selectQuestionListUrl;
  
  final String selectQuestionUrl;
  
  final String selfExcerpt;
  
  final String serialArea;
  
  private final String seriesPostButtonUrl;
  
  String storageNotEnough;
  
  final String storyTemplateUrl;
  
  final String stroyQuestionEditorUrl;
  
  final String thirdPartySDKDefaultUrl;
  
  final String topicInviteAnswerUrl;
  
  final String topicWithCoinRules;
  
  final String ugcBookListUrl;
  
  final String ugcDynamicDetailUrl;
  
  final String ugcEditorUrl;
  
  final String ugcPostDetailUrl;
  
  final String ugcStoryDetailUrl;
  
  final String ugcTopicEditorUrl;
  
  final String ugcTopicPostEditorUrl;
  
  private final String ugcVideoListUrl;
  
  final String unblockUrl;
  
  private final String urgeHepleUrl;
  
  final String userGuideUrl;
  
  final String userProfileUrl;
  
  final String userRelationUrl;
  
  final String videoCreativeTaskPageUrl;
  
  private final String videoUgcPublishUrl;
  
  final String vipHalfPageDefaultUrl;
  
  final String vipHalfPageDefaultUrlHg;
  
  final String vipPageDefaultUrl;
  
  final String vipPageDefaultUrlHg;
  
  final String vipPayDefaultUrl;
  
  final String vipPayResultDefaultUrl;
  
  final String vipPopupDefaultUrl;
  
  static {
    Covode.recordClassIndex(597345);
    StringBuilder stringBuilder = new StringBuilder();
    stringBuilder.append("&title=");
    stringBuilder.append(URLEncoder.encode("));
    QUERY_DOUYIN_AUTH_TITLE = stringBuilder.toString();
    stringBuilder = new StringBuilder();
    stringBuilder.append("&title=");
    stringBuilder.append(URLEncoder.encode("));
    QUERY_DOUYIN_PROTOCOL_TITLE = stringBuilder.toString();
    stringBuilder = new StringBuilder();
    stringBuilder.append("&title=");
    stringBuilder.append(URLEncoder.encode("));
    QUERY_DOUYIN_POLICY_TITLE = stringBuilder.toString();
  }
  
  private WebUrlManager() {
    StringBuilder stringBuilder = new StringBuilder();
    stringBuilder.append(b.a);
    stringBuilder.append(App.context().getString(2131100085));
    this.agreementDefaultUrl = stringBuilder.toString();
    stringBuilder = new StringBuilder();
    stringBuilder.append(b.a);
    stringBuilder.append("://webview?url=https%3A%2F%2Freading.snssdk.com%2Freading_offline%2Fdrweb%2Fpage%2Fchapter-end.html&loadingButHideByFront=1");
    this.chapterEndDefaultUrl = stringBuilder.toString();
    stringBuilder = new StringBuilder();
    stringBuilder.append(b.a);
    stringBuilder.append("://webview?url=https%3A%2F%2Freading.snssdk.com%2Freading_offline%2Fdrweb%2Fpage%2Ffeedback-list.html&hideLoading=1");
    this.feedbackDefaultUrl = stringBuilder.toString();
    stringBuilder = new StringBuilder();
    stringBuilder.append(b.a);
    stringBuilder.append("://webview?url=https%3A%2F%2Freading.snssdk.com%2Freading_offline%2Fdrweb%2Fpage%2Fhelp.html&hideLoading=1");
    this.helpDefaultUrl = stringBuilder.toString();
    stringBuilder = new StringBuilder();
    stringBuilder.append(b.a);
    stringBuilder.append(App.context().getString(2131103877));
    this.privacyDefaultUrl = stringBuilder.toString();
    stringBuilder = new StringBuilder();
    stringBuilder.append(b.a);
    stringBuilder.append("://webview?url=https%3A%2F%2Freading.snssdk.com%2Fwap%2Faccount-data-usage.html");
    this.registerAgreementDefaultUrl = stringBuilder.toString();
    this.myTabMallIndependentLynxDefaultUrl = "sslocal://lynxview/?surl=https%3A%2F%2Freading.snssdk.com%2Freading_offline%2Fdrlynx_dynamic_card%2Fecom-tabs-card%2Ftemplate.js&prefix=reading_offline";
    this.myTabMallIndependentLynxDefaultUrlNew = "sslocal://lynxview/?surl=https%3A%2F%2Freading.snssdk.com%2Freading_offline%2Fdrlynx_dynamic_card%2Fecom-tabs-card%2Ftemplate.js&prefix=reading_offline&enable_anniex=1";
    stringBuilder = new StringBuilder();
    stringBuilder.append(b.a);
    stringBuilder.append(App.context().getString(2131099987));
    this.basicDataUsageUrl = stringBuilder.toString();
    stringBuilder = new StringBuilder();
    stringBuilder.append(b.a);
    stringBuilder.append("://webview?url=https%3A%2F%2Freading.snssdk.com%2Fwap%2Fdr-graph-privacy-v1.html");
    this.graphicPrivacyDefaultUrl = stringBuilder.toString();
    stringBuilder = new StringBuilder();
    stringBuilder.append(b.a);
    stringBuilder.append("://webview?url=https%3A%2F%2Freading.snssdk.com%2Fwap%2Fdr-privacy-v3-ad.html%3FfirstBasic%3D1");
    this.basicFunctionSwitchUrl = stringBuilder.toString();
    stringBuilder = new StringBuilder();
    stringBuilder.append(b.a);
    stringBuilder.append("://webview?url=https%3A%2F%2Freading.snssdk.com%2Freading_offline%2Fdrweb%2Fpage%2Fvip.html&loadingButHideByFront=1&hideNavigationBar=1");
    this.vipPayDefaultUrl = stringBuilder.toString();
    stringBuilder = new StringBuilder();
    stringBuilder.append(b.a);
    stringBuilder.append("://webview?url=https%3A%2F%2Freading.snssdk.com%2Freading_offline%2Fdrweb%2Fpage%2Fvip-result.html&loadingButHideByFront=1");
    this.vipPayResultDefaultUrl = stringBuilder.toString();
    this.vipPopupDefaultUrl = "https://reading.snssdk.com/reading_offline/drweb/page/vip-popup.html";
    stringBuilder = new StringBuilder();
    stringBuilder.append(b.a);
    stringBuilder.append("://lynxview?hideLoading=0&hideNavigationBar=1&hideStatusBar=1&customBrightnessScheme=0&url=sslocal%3A%2F%2Flynxview%2F%3Fsurl%3Dhttps%253A%252F%252Freading.snssdk.com%252Freading_offline%252Fdrlynx_monetize%252Fvip-page%252Ftemplate.js%26dr_brightness%3Dlight");
    this.vipPageDefaultUrl = stringBuilder.toString();
    this.vipHalfPageDefaultUrl = "sslocal://lynx_popup?pop_name=vip-halfpage-popup&url=https%3A%2F%2Freading.snssdk.com%2Freading_offline%2Fdrlynx_monetize%2Fvip-halfpage-popup%2Ftemplate.js";
    this.vipPageDefaultUrlHg = "dragon8662://lynxview?hideLoading=0&hideNavigationBar=1&hideStatusBar=1&customBrightnessScheme=0&url=sslocal%3A%2F%2Flynxview%2F%3Fsurl%3Dhttps%253A%252F%252Freading.snssdk.com%252Freading_offline%252Fnrlynx%252Fvip-page%252Ftemplate.js%26dr_brightness%3Dlight";
    this.vipHalfPageDefaultUrlHg = "sslocal://lynx_popup?pop_name=vip-halfpage-popup&popup_type=1&url=https%3A%2F%2Freading.snssdk.com%2Freading_offline%2Fnrlynx%2Fvip-halfpage-popup%2Ftemplate.js";
    this.postFeedbackDefaultUrl = "https://ic.snssdk.com/reading_offline/drweb/feedback-v3.html";
    stringBuilder = new StringBuilder();
    stringBuilder.append(b.a);
    stringBuilder.append("://webview?url=https%3A%2F%2Freading.snssdk.com%2Freading_offline%2Fdrweb%2Fpage%2Ffeedback-entry.html");
    this.feedbackEntryUrl = stringBuilder.toString();
    stringBuilder = new StringBuilder();
    stringBuilder.append(b.a);
    stringBuilder.append("://webview?url=https%3A%2F%2Freading.snssdk.com%2Freading_offline%2Fdrweb%2Fpage%2Fnews-notice.html&loadingButHideByFront=1&hideNavigationBar=1&hideStatusBar=1&bounceDisable=1&customBrightnessScheme=1");
    this.myMessageEntryUrl = stringBuilder.toString();
    stringBuilder = new StringBuilder();
    stringBuilder.append(b.a);
    stringBuilder.append("://communityWebview?url=https%3A%2F%2Freading.snssdk.com%2Freading_offline%2Fdrweb_community%2Fpage%2Fmsg-saas.html&loadingButHideByFront=1&hideNavigationBar=1&hideStatusBar=1&bounceDisable=1&customBrightnessScheme=1");
    this.communitySaaSMessageEntryUrl = stringBuilder.toString();
    stringBuilder = new StringBuilder();
    stringBuilder.append(b.a);
    stringBuilder.append("://communityWebview?hideStatusBar=1&hideNavigationBar=1&bounceDisable=1&loadingButHideByFront=1&customBrightnessScheme=1&url=https%3A%2F%2Freading.snssdk.com%2Freading_offline%2Fnovelread%2Fpage%2Fmsg-saas.html");
    this.communityHongguoSaaSMessageEntryUrl = stringBuilder.toString();
    stringBuilder = new StringBuilder();
    stringBuilder.append(b.a);
    stringBuilder.append("://communityWebview?hideStatusBar=1&hideNavigationBar=1&bounceDisable=1&loadingButHideByFront=1&customBrightnessScheme=1&url=https%3A%2F%2Freading.snssdk.com%2Freading_offline%2Fcdweb%2Fpage%2Fmsg-saas.html");
    this.communityChangduSaaSMessageEntryUrl = stringBuilder.toString();
    stringBuilder = new StringBuilder();
    stringBuilder.append(b.a);
    stringBuilder.append("://communityWebview?hideStatusBar=1&hideNavigationBar=1&bounceDisable=1&loadingButHideByFront=1&customBrightnessScheme=1&url=https%3A%2F%2Freading.snssdk.com%2Freading_offline%2Fdhweb%2Fpage%2Fmsg-saas.html");
    this.communityEggFlowerSaaSMessageEntryUrl = stringBuilder.toString();
    stringBuilder = new StringBuilder();
    stringBuilder.append(b.a);
    stringBuilder.append("://webview?url=https%3A%2F%2Freading.snssdk.com%2Fwap%2Flicense.html");
    this.licenseDefaultUrl = stringBuilder.toString();
    stringBuilder = new StringBuilder();
    stringBuilder.append(b.a);
    stringBuilder.append("://webview?url=https%3A%2F%2Freading.snssdk.com%2Fwap%2Fcommunity-convention-ad.html");
    this.communityConventionUrl = stringBuilder.toString();
    stringBuilder = new StringBuilder();
    stringBuilder.append(b.a);
    stringBuilder.append("://webview?hideStatusBar=1&hideNavigationBar=1&url=https%3A%2F%2Freading.snssdk.com%2Fwap%2Fbecome-writer.html");
    this.becomeWriter = stringBuilder.toString();
    stringBuilder = new StringBuilder();
    stringBuilder.append(b.a);
    stringBuilder.append("://webview?url=https%3A%2F%2Freading.snssdk.com%2Freading_offline%2Fdrlazy%2Fpage%2Flogout.html&hideNavigationBar=1&hideStatusBar=1");
    this.closeAccountUrl = stringBuilder.toString();
    stringBuilder = new StringBuilder();
    stringBuilder.append(b.a);
    stringBuilder.append("://webview?url=https://reading.snssdk.com/reading_offline/drweb/page/help-detail.html?id=24949&parent_id=23893");
    this.urgeHepleUrl = stringBuilder.toString();
    stringBuilder = new StringBuilder();
    stringBuilder.append(b.a);
    stringBuilder.append("://webview?url=https%3A%2F%2Freading.snssdk.com%2Freading_offline%2Fdrweb%2Fpage%2Fserial-rank.html%3Fbook_id=__ReadingReplaceBookId__&loadingButHideByFront=1&hideNavigationBar=1&bounceDisable=1&hideStatusBar=1");
    this.unblockUrl = stringBuilder.toString();
    stringBuilder = new StringBuilder();
    stringBuilder.append(b.a);
    stringBuilder.append("://webview?loadingButHideByFront=1&url=https%3a%2f%2freading.snssdk.com%2freading_offline%2fdrweb%2fpage%2fserial-area.html");
    this.serialArea = stringBuilder.toString();
    stringBuilder = new StringBuilder();
    stringBuilder.append(b.a);
    stringBuilder.append("://webview?url=https%3A%2F%2Freading.snssdk.com%2Fwap%2Fonload-retain.html");
    this.storageNotEnough = stringBuilder.toString();
    stringBuilder = new StringBuilder();
    stringBuilder.append(b.a);
    stringBuilder.append("://webview?loadingButHideByFront=1&bounceDisable=1&hideStatusBar=1&hideNavigationBar=1&url=https%3A%2F%2Freading.snssdk.com%2Freading_offline%2Fdrweb%2Fpage%2Frank.html%3Fcell_id%3D6800923207869136909%26cell_sub_id%3D0%26cell_name%3D%25E6%258E%2592%25E8%25A1%258C%25E6%25A6%259C%26cell_gender%3D1%26has_audio_tab%3D1%26book_type%3D0%26audio_rank_names%3D%25E6%258E%25A8%25E8%258D%2590%25E6%25A6%259C%252C%25E5%25AE%258C%25E6%259C%25AC%25E6%25A6%259C%252C%25E7%2595%25AA%25E8%258C%2584%25E6%25A6%259C%252C%25E9%25BB%2591%25E9%25A9%25AC%25E6%25A6%259C%252C%25E7%2583%25AD%25E6%2590%259C%25E6%25A6%259C%26cell_id_opposite%3D6812858334333370375%26rank_names%3D%25E6%258E%25A8%25E8%258D%2590%25E6%25A6%259C%252C%25E5%25AE%258C%25E6%259C%25AC%25E6%25A6%259C%252C%25E7%2595%25AA%25E8%258C%2584%25E6%25A6%259C%252C%25E9%25BB%2591%25E9%25A9%25AC%25E6%25A6%259C%252C%25E7%2583%25AD%25E6%2590%259C%25E6%25A6%259C");
    this.rankPageUrl = stringBuilder.toString();
    stringBuilder = new StringBuilder();
    stringBuilder.append(b.a);
    stringBuilder.append("://webview?hideStatusBar=1&hideNavigationBar=1&customBrightnessScheme=1&bounceDisable=1&url=https%3A%2F%2Freading.snssdk.com%2Freading_offline%2Fserial%2Fpage%2Fauthor-center.html");
    this.authorCentre = stringBuilder.toString();
    this.operationEntry = "https://reading.snssdk.com/reading_offline/drweb_community/page/topic.html";
    stringBuilder = new StringBuilder();
    stringBuilder.append(b.a);
    stringBuilder.append("://webview?url=https%3A%2F%2Freading.snssdk.com%2Fwap%2Fgift-protocol.html");
    this.rewardRule = stringBuilder.toString();
    stringBuilder = new StringBuilder();
    stringBuilder.append(b.a);
    stringBuilder.append("://webview?url=http%3A%2F%2Freading.snssdk.com%2Freading_offline%2Fdrweb%2Fpage%2Fgift-rank.html&hideStatusBar=1&hideNavigationBar=1");
    this.rewardWall = stringBuilder.toString();
    stringBuilder = new StringBuilder();
    stringBuilder.append(b.a);
    stringBuilder.append("://webview?url=https%3A%2F%2Freading.snssdk.com%2Fwap%2Fdr-sdk.html");
    this.thirdPartySDKDefaultUrl = stringBuilder.toString();
    stringBuilder = new StringBuilder();
    stringBuilder.append(b.a);
    stringBuilder.append("://webview?url=https%3A%2F%2Freading.snssdk.com%2Freading_offline%2Fdrweb_community%2Fpage%2Fmy-follow.html&loadingButHideByFront=1&hideNavigationBar=1&hideStatusBar=1&bounceDisable=1");
    this.myFollow = stringBuilder.toString();
    stringBuilder = new StringBuilder();
    stringBuilder.append(b.a);
    stringBuilder.append("://webview?url=https%3A%2F%2Freading.snssdk.com%2Freading_offline%2Fdrweb%2Fpage%2Fmy-publish.html&loadingButHideByFront=1&hideNavigationBar=1&hideStatusBar=1&bounceDisable=1");
    this.myPublish = stringBuilder.toString();
    stringBuilder = new StringBuilder();
    stringBuilder.append(b.a);
    stringBuilder.append("://webview?url=https%3A%2F%2Freading.snssdk.com%2Fwap%2Ffans-description.html");
    this.fansDescription = stringBuilder.toString();
    stringBuilder = new StringBuilder();
    stringBuilder.append(b.a);
    stringBuilder.append("://webview?loadingButHideByFront=1&bounceDisable=1&hideStatusBar=1&hideNavigationBar=1&url=https%3A%2F%2Freading.snssdk.com%2Freading_offline%2Fdrweb_community%2Fpage%2Ffan-list.html");
    this.fansRank = stringBuilder.toString();
    this.bookUploadHtmlZipUrl = App.context().getString(2131100417);
    stringBuilder = new StringBuilder();
    stringBuilder.append(b.a);
    stringBuilder.append("://webview?url=https%3A%2F%2Freading.snssdk.com%2Freading_offline%2Fdrweb_community%2Fpage%2Fgift-rank-v2.html&loadingButHideByFront=1&bounceDisable=1&hideStatusBar=1&hideNavigationBar=1");
    this.rewardRank = stringBuilder.toString();
    stringBuilder = new StringBuilder();
    stringBuilder.append(b.a);
    stringBuilder.append("://webview?url=https%3A%2F%2Freading.snssdk.com%2Freading_offline%2Fdrlazy%2Fpage%2Fblack-house.html&loadingButHideByFront=1&bounceDisable=1&hideStatusBar=1&hideNavigationBar=1");
    this.blackHouse = stringBuilder.toString();
    stringBuilder = new StringBuilder();
    stringBuilder.append(b.a);
    stringBuilder.append("://webview?url=https%3A%2F%2Freading.snssdk.com%2Fwap%2Fclock-in-help.html");
    this.clockInHelp = stringBuilder.toString();
    stringBuilder = new StringBuilder();
    stringBuilder.append(b.a);
    stringBuilder.append("://webview?url=https%3A%2F%2Freading.snssdk.com%2Fwap%2Fdr-applimit.html");
    this.permissionListUrl = stringBuilder.toString();
    this.ugcEditorUrl = "https://reading.snssdk.com/reading_offline/drweb_community/page/topic-post-create-v2.html";
    this.ugcTopicPostEditorUrl = "https://reading.snssdk.com/reading_offline/drweb_community/page/topic-post-create-v3.html";
    this.ugcPostDetailUrl = "https://reading.snssdk.com/reading_offline/drweb_community/page/ugc-post-detail.html";
    this.ugcTopicEditorUrl = "https://reading.snssdk.com/reading_offline/drweb/page/topic-create.html";
    stringBuilder = new StringBuilder();
    stringBuilder.append(b.a);
    stringBuilder.append("://webview?url=https%3A%2F%2Freading.snssdk.com%2Fwap%2Ftopic-savior.html");
    this.reqBookTopicDetail = stringBuilder.toString();
    stringBuilder = new StringBuilder();
    stringBuilder.append(b.a);
    stringBuilder.append("://webview?url=https%3A%2F%2Freading.snssdk.com%2Fwap%2Fbook-operator.html");
    this.forumOperatorDetail = stringBuilder.toString();
    stringBuilder = new StringBuilder();
    stringBuilder.append(b.a);
    stringBuilder.append("://webview?url=https%3A%2F%2Fi.snssdk.com%2Fgf%2Fucenter%2Fnovel-dragon%2Ffaq");
    this.faqDefaultUrl = stringBuilder.toString();
    stringBuilder = new StringBuilder();
    stringBuilder.append(b.a);
    stringBuilder.append("://webview?url=https%3A%2F%2Freading.snssdk.com%2Fwap%2Fpersonal-recommend.html");
    this.personalRecommendDefaultUrl = stringBuilder.toString();
    stringBuilder = new StringBuilder();
    stringBuilder.append(b.a);
    stringBuilder.append("://webview?url=https%3A%2F%2Fefe.snssdk.com%2Fads%2Fexplain%3Fenter_from%3DSettings");
    this.advertisingControlDefaultUrl = stringBuilder.toString();
    stringBuilder = new StringBuilder();
    stringBuilder.append(b.a);
    stringBuilder.append("://webview?url=https%3A%2F%2Fad-experience.bytedance.com%2Ffanqie_novel_splash_ad_interactivity_setting.html");
    this.csjShakeSettingDefaultUrl = stringBuilder.toString();
    this.searchTopicTabLynxUrl = "sslocal://lynxview?surl=https%3A%2F%2Freading.snssdk.com%2Freading_offline%2Fdrlynx%2Fsearch-topic-list%2Ftemplate.js&prefix=reading_offline&thread_strategy=2";
    stringBuilder = new StringBuilder();
    stringBuilder.append(b.a);
    stringBuilder.append("://webview?hideNavigationBar=1&url=https%3A%2F%2Fi.snssdk.com%2Fucenter_web%2Fnovel-dragon%2Fpersonal_information");
    this.personalInformationUrl = stringBuilder.toString();
    stringBuilder = new StringBuilder();
    stringBuilder.append(b.a);
    stringBuilder.append("://webview?hideNavigationBar=1&url=https%3A%2F%2Freading.snssdk.com%2Fwap%2Fdr-personal-info-list.html");
    this.personalInfoListUrl = stringBuilder.toString();
    stringBuilder = new StringBuilder();
    stringBuilder.append(b.a);
    stringBuilder.append("://webview?url=https%3A%2F%2Freading.snssdk.com%2Freading_offline%2Fdrweb%2Fpage%2Ffeedback.html%3Fqr_id%3D74292%26parent_id%3D23681%26type%3Dappeal");
    this.appealUrl = stringBuilder.toString();
    stringBuilder = new StringBuilder();
    stringBuilder.append(b.a);
    stringBuilder.append("://webview?url=https://lf3-beecdn.bytetos.com/obj/ies-fe-bee/bee_prod/biz_167/bee_prod_167_bee_publish_915.html");
    stringBuilder.append(QUERY_DOUYIN_AUTH_TITLE);
    this.douyinPrivacyUrl = stringBuilder.toString();
    stringBuilder = new StringBuilder();
    stringBuilder.append(b.a);
    stringBuilder.append("://webview?loadingButHideByFront=1&customBrightnessScheme=1&url=https%3A%2F%2Freading.snssdk.com%2Freading_offline%2Fdrweb%2Fpage%2Ftopic-user-invite.html");
    this.inviteAnswerUrl = stringBuilder.toString();
    stringBuilder = new StringBuilder();
    stringBuilder.append(b.a);
    stringBuilder.append("://webview?loadingButHideByFront=1&bounceDisable=1&hideStatusBar=1&hideNavigationBar=1&url=https%3A%2F%2Freading.snssdk.com%2Freading_offline%2Fdrweb%2Fpage%2Ftopic-hot-book.html");
    this.hotReadBookUrl = stringBuilder.toString();
    this.bookCommentEditorUrl = "https://reading.snssdk.com/reading_offline/drweb_community/page/book-comment.html";
    this.saasBookCommentEditorUrl = "https://reading.snssdk.com/reading_offline/drweb_community/page/book-comment.html";
    stringBuilder = new StringBuilder();
    stringBuilder.append(b.a);
    stringBuilder.append("://webview?loadingButHideByFront=1&url=https%3A%2F%2Freading.snssdk.com%2Freading_offline%2Fdrweb%2Fpage%2Ftopic-with-coin-rules.html");
    this.topicWithCoinRules = stringBuilder.toString();
    stringBuilder = new StringBuilder();
    stringBuilder.append(b.a);
    stringBuilder.append("://webview?url=https%3A%2F%2Freading.snssdk.com%2Fwap%2Fsavior-contract-manage.html&hideNavigationBar=0&bounceDisable=1&hideStatusBar=0");
    this.contractEntrance = stringBuilder.toString();
    this.forwardEditorUrl = "https://reading.snssdk.com/reading_offline/drweb_community/page/ugc-forward-editor.html";
    this.ugcDynamicDetailUrl = "https://reading.snssdk.com/reading_offline/drweb_community/page/ugc-dynamic-detail.html";
    this.ugcStoryDetailUrl = "https://reading.snssdk.com/reading_offline/drweb_community/page/ugc-story-detail.html";
    stringBuilder = new StringBuilder();
    stringBuilder.append(b.a);
    stringBuilder.append("://webview?url=https%3A%2F%2Freading.snssdk.com%2Fwap%2Fteen-agreement.html");
    this.childrenMessageProtectUrl = stringBuilder.toString();
    this.ugcBookListUrl = "https://reading.snssdk.com/reading_offline/drweb/page/book-list-post-create.html";
    stringBuilder = new StringBuilder();
    stringBuilder.append(b.a);
    stringBuilder.append("://webview?url=https%3A%2F%2Freading.snssdk.com%2Fwap%2Fhot-wire.html");
    this.customerServiceUrl = stringBuilder.toString();
    this.payWallLynxUrl = "sslocal://lynxview/?surl=https%3A%2F%2Freading.snssdk.com%2Freading_offline%2Fdrlynx_monetize%2Fpay-wall%2Ftemplate.js&prefix=reading_offline";
    stringBuilder = new StringBuilder();
    stringBuilder.append(b.a);
    stringBuilder.append("://webview?url=https://www.douyin.com/agreements/?id=6773906068725565448");
    stringBuilder.append(QUERY_DOUYIN_PROTOCOL_TITLE);
    this.douyinUserProtocolUrl = stringBuilder.toString();
    stringBuilder = new StringBuilder();
    stringBuilder.append(b.a);
    stringBuilder.append("://webview?url=https://www.douyin.com/draft/douyin_agreement/douyin_agreement_privacy.html?id=6773901168964798477");
    stringBuilder.append(QUERY_DOUYIN_POLICY_TITLE);
    this.douyinPrivacyPolicyUrl = stringBuilder.toString();
    this.inviteAnswerListUrl = "https://reading.snssdk.com/reading_offline/drweb/page/invite-answer.html";
    stringBuilder = new StringBuilder();
    stringBuilder.append(b.a);
    stringBuilder.append("://webview?url=https%3A%2F%2Freading.snssdk.com%2Fmagic%2Feco%2Fruntime%2Frelease%2F63072d3a0a4dcd98df07645e%3FappType%3Ddragon%26magic_page_no%3D1%26tab_name%3D%26module_name%3D&hideNavigationBar=1&bounceDisable=1&hideStatusBar=1");
    this.userGuideUrl = stringBuilder.toString();
    stringBuilder = new StringBuilder();
    stringBuilder.append(b.a);
    stringBuilder.append("://webview?url=https%3A%2F%2Flf1-cdn-tos.toutiaostatic.com%2Fobj%2Fnovel-copy-config-cn%2F636cf4bc94bac0003c1e1cb8.html%3Ffanqie%3D1&title=%E6%89%93%E8%B5%8F%E6%8E%92%E8%A1%8C%E6%9C%88%E6%A6%9C%E8%A7%84%E5%88%99%E8%AF%B4%E6%98%8E");
    this.rewardRankRule = stringBuilder.toString();
    this.selfExcerpt = "sslocal://lynxview/?surl=https%3A%2F%2Freading.snssdk.com%2Freading_offline%2Fdrlynx%2Fself-excerpt%2Ftemplate.js%3Flimit%3D10%26offset%3D0%0A";
    stringBuilder = new StringBuilder();
    stringBuilder.append(b.a);
    stringBuilder.append("://webview?loadingButHideByFront=1&customBrightnessScheme=1&hideNavigationBar=1&bounceDisable=1&hideStatusBar=1&url=https%3A%2F%2Freading.snssdk.com%2Freading_offline%2Fdrweb_community%2Fpage%2Fuser-social.html");
    this.followUrl = stringBuilder.toString();
    stringBuilder = new StringBuilder();
    stringBuilder.append(b.a);
    stringBuilder.append("://webview?url=https%3A%2F%2Flf1-cdn-tos.toutiaostatic.com%2Fobj%2Fnovel-copy-config-cn%2F60011287df0ab3003b5c1f8e.html");
    this.authorAgreement = stringBuilder.toString();
    stringBuilder = new StringBuilder();
    stringBuilder.append(b.a);
    stringBuilder.append("://webview?url=https%3A%2F%2Flf1-cdn-tos.toutiaostatic.com%2Fobj%2Fnovel-copy-config-cn%2F6019713d487fb6003b1f221f.html");
    this.authorPrivacy = stringBuilder.toString();
    stringBuilder = new StringBuilder();
    stringBuilder.append(b.a);
    stringBuilder.append("://webview?url=https%3A%2F%2Ffanqienovel.com%2FuserProtocal");
    this.authorPCAgreement = stringBuilder.toString();
    stringBuilder = new StringBuilder();
    stringBuilder.append(b.a);
    stringBuilder.append("://webview?url=https%3A%2F%2Ffanqienovel.com%2Fpravite-protocal");
    this.authorPCPrivacy = stringBuilder.toString();
    this.myOrderUrl = "sslocal://webcast_lynxview?type=fullscreen&url=https%3A%2F%2Flf-webcast-sourcecdn-tos.bytegecko.com%2Fobj%2Fbyte-gurd-source%2Fwebcast%2Fecom%2Flynx%2Fecom_mall_fanqie%2Fhome%2Ftemplate.js%3Fis_full%3D1%26enter_from%3Dmine_tab_order_page&hide_nav_bar=1&hide_status_bar=0&status_bar_color=black&trans_status_bar=1&hide_loading=1&enable_share=0&show_back=0&web_bg_color=%23ffffffff&top_level=1&show_close=0&load_taro=0&host=aweme";
    this.myOrderLynxUrl = "sslocal://webcast_lynxview?type=fullscreen&url=https%3A%2F%2Flf-webcast-sourcecdn-tos.bytegecko.com%2Fobj%2Fbyte-gurd-source%2Fwebcast%2Ffalcon%2Fdongchedi%2Fecommerce_orders_dongchedi%2Fapp_new%2Ftemplate.js&hide_nav_bar=1&load_taro=0&trans_status_bar=1&status_bar_color=black&web_bg_color=ffffffff&host=aweme&needFqLogin=1";
    this.csrEntranceDefaultDebugUrl = "sslocal://webcast_lynxview?type=fullscreen&url=https%3A%2F%2Ftosv.byted.org%2Fobj%2Fgecko-internal%2F10180%2Fgecko%2Fresource%2Fwelfare_app%2Fpages%2Fhome%2Ftemplate.js&engine_type=new&host=aweme&launch_mode=remove_same_page&status_bar_color=black&hide_nav_bar=1&trans_status_bar=1&web_bg_color=fff4f5f7&is_launch_page=1&use_latch_ng=1&enable_canvas=1";
    this.csrEntranceDefaultUrl = "sslocal://webcast_lynxview?type=fullscreen&url=https%3A%2F%2Flf-webcast-sourcecdn-tos.bytegecko.com%2Fobj%2Fbyte-gurd-source%2F10181%2Fgecko%2Fresource%2Fwelfare_app%2Fpages%2Fhome%2Ftemplate.js&engine_type=new&host=aweme&launch_mode=remove_same_page&status_bar_color=black&hide_nav_bar=1&trans_status_bar=1&web_bg_color=fff4f5f7&is_launch_page=1&use_latch_ng=1&enable_canvas=1&source=solid";
    stringBuilder = new StringBuilder();
    stringBuilder.append(b.a);
    stringBuilder.append("://webview?url=https%3A%2F%2Freading.snssdk.com%2Freading_offline%2Fdrlazy%2Fpage%2Fmute-manage.html%3Fbook_id%3D123&loadingButHideByFront=1&hideNavigationBar=1&hideStatusBar=1&bounceDisable=1&customBrightnessScheme=1");
    this.muteManageUrl = stringBuilder.toString();
    this.catalogSimilarBookListUrl = "sslocal://lynxview/?surl=https%3A%2F%2Freading.snssdk.com%2Freading_offline%2Fdrlynx%2Fcatalog-similar-booklist%2Ftemplate.js%3Fcell_id%3D7199965756308586533";
    stringBuilder = new StringBuilder();
    stringBuilder.append(b.a);
    stringBuilder.append("://webview?loadingButHideByFront=1&hideNavigationBar=1&bounceDisable=1&hideStatusBar=1&url=https%3A%2F%2Freading.snssdk.com%2Freading_offline%2Fdrweb_community%2Fpage%2Fpersonal-ranking.html");
    this.personalRankingUrl = stringBuilder.toString();
    stringBuilder = new StringBuilder();
    stringBuilder.append(b.a);
    stringBuilder.append("://webview?url=https%3A%2F%2Freading.snssdk.com%2Freading_offline%2Fdrweb_community%2Fpage%2Fcreative-income.html");
    this.creationIncomePageUrl = stringBuilder.toString();
    this.storyTemplateUrl = "sslocal://lynxview?thread_strategy=2&surl=https%3A%2F%2Freading.snssdk.com%2Freading_offline%2Fdrlynx_community%2Feditor-story-template-tab%2Ftemplate.js";
    this.bookListEditorJs = "https://lf-cdn-tos.bytescm.com/obj/static/novel-dragon/feoffline/drweb/workers/editor-parser.worker.js";
    this.authorPopularityRankUrl = "https://reading.snssdk.com/reading_offline/drweb_community/page/author-popularity-rank.html";
    stringBuilder = new StringBuilder();
    stringBuilder.append(b.a);
    stringBuilder.append("://webview?hideStatusBar=1&hideNavigationBar=1&loadingButHideByFront=1&url=https%3A%2F%2Freading.snssdk.com%2Freading_offline%2Fdrweb_community%2Fpage%2Fbook-comment-guide.html");
    this.bookCommentGuideUrl = stringBuilder.toString();
    stringBuilder = new StringBuilder();
    stringBuilder.append(b.a);
    stringBuilder.append("://lynxview?loadingButHideByFront=1&hideNavigationBar=1&hideStatusBar=1&bounceDisable=1&customBrightnessScheme=1&url=sslocal%3A%2F%2Flynxview%3Fthread_strategy%3D2%26surl%3Dhttps%253A%252F%252Freading.snssdk.com%252Freading_offline%252Fdrlynx%252Fhot-topic-v1%252Ftemplate.js%253Fcell_id%253D6914906572011339784%2526cell_name%253D%25E4%25B9%25A6%25E8%258D%2592%25E5%25B9%25BF%25E5%259C%25BA%2526req_source%253Dtopic_list%2526tab_type%253D2%2526exposure_type%253D0%2526tab_child_type%253D1");
    this.bookStoreTopicLandingPageToBookList = stringBuilder.toString();
    stringBuilder = new StringBuilder();
    stringBuilder.append(b.a);
    stringBuilder.append("://webview?url=https%3A%2F%2Freading.snssdk.com%2Fwap%2Fgift-protocol-new.html");
    this.newGiftAgreementUrl = stringBuilder.toString();
    stringBuilder = new StringBuilder();
    stringBuilder.append(b.a);
    stringBuilder.append("://webview?hideNavigationBar=1&customBrightness=1&url=https%3A%2F%2Freading.snssdk.com%2Freading_offline%2Fdrweb%2Fpage%2Fdevice-management.html%3Fcustom_brightness%3D1");
    this.multiDeviceManageUrl = stringBuilder.toString();
    this.imRobotListUrl = "https://reading.snssdk.com/reading_offline/drweb_community/page/robot-list.html";
    this.imRobotDetailUrl = "https://reading.snssdk.com/reading_offline/drweb_community/page/robot-detail.html";
    this.imRobotDetailPiaUrl = "https://reading.snssdk.com/reading_offline/drweb_community_pia/page/robot-detail-pia.html";
    this.imRobotAIList = "dragon1967://webview?hideStatusBar=1&hideNavigationBar=1&customBrightnessScheme=1&url=https%3A%2F%2Freading.snssdk.com%2Freading_offline%2Fdrweb_community%2Fpage%2Frobot-ai-list.html";
    this.topicInviteAnswerUrl = "dragon1967://webview?enterAnim=3&loadingButHideByFront=1&hideNavigationBar=1&hideStatusBar=1&url=https%3A%2F%2Freading.snssdk.com%2Freading_offline%2Fdrweb%2Fpage%2Ftopic-invite-answer-v2.html&enterAnim=3";
    this.activityTopicEditorUrl = "https://reading.snssdk.com/reading_offline/drweb_community/page/activity-topic-editor.html";
    this.selectQuestionUrl = "dragon1967://webview?enterAnim=3&loadingButHideByFront=1&hideNavigationBar=1&bounceDisable=1&hideStatusBar=1&customBrightnessScheme=1";
    this.bookPraiseRankUrl = "https://reading.snssdk.com/reading_offline/drweb_community/page/praise-rank-list.html";
    this.changduuPayWallUrl = "sslocal://lynxview/?surl=https%3A%2F%2Freading.snssdk.com%2Freading_offline%2Fcdlynx%2Fchangdu-pay-wall%2Ftemplate.js&prefix=reading_offline";
    this.eggFlowerPayWallUrl = "sslocal://lynxview/?surl=https%3A%2F%2Freading.snssdk.com%2Freading_offline%2Fdhlynx%2Fchangdu-pay-wall%2Ftemplate.js&prefix=reading_offline";
    this.stroyQuestionEditorUrl = "https://reading.snssdk.com/reading_offline/drweb_community/page/story-question-editor.html";
    this.giftRecordPageUrl = "https://reading.snssdk.com/reading_offline/drweb_community/page/reward-list.html";
    this.mineVipBannerPageUrl = "sslocal://lynxview/?surl=https%3A%2F%2Freading.snssdk.com%2Freading_offline%2Fdrlynx_dynamic_card%2Fvip-tabs-card%2Ftemplate.js&prefix=reading_offline";
    this.videoCreativeTaskPageUrl = "dragon1967://webview?bounceDisable=1&needFqLogin=1&customBrightnessScheme=1&loadingButHideByFront=1&hideNavigationBar=1&hideStatusBar=1&url=https%3A%2F%2Freading.snssdk.com%2Freading_offline%2Fdrweb_community%2Fpage%2Fcreative-task-detail.html%3Ftask_id%3D7304212942680457255%26custom_brightness%3D1%26entrance%3Dcreative_center%26task_entrance%3Dvideo_editor%26hide_task_btn%3D1";
    this.fanGroupsUrl = "https://reading.snssdk.com/reading_offline/drweb_community/page/fan-groups.html";
    this.payingAttentionUrl = "https://reading.snssdk.com/reading_offline/drweb_community/page/paying-attention.html";
    this.selectQuestionListUrl = "https://reading.snssdk.com/reading_offline/drweb_community/page/select-question-list.html";
    this.bookWikiUrl = "https://reading.snssdk.com/reading_offline/drweb_community/page/book-wiki.html";
    this.bookCoinUrl = "dragon1967://lynxview?customBrightnessScheme=1&hideLoading=1&hideNavigationBar=1&hideStatusBar=1&url=sslocal%3A%2F%2Flynxview%2F%3Fsurl%3Dhttps%253A%252F%252Freading.snssdk.com%252Freading_offline%252Fdrlynx_monetize%252Fpublish-book-coin%252Ftemplate.js%26prefix%3Dreading_offline";
    this.coinBuyBookUrl = "sslocal://lynx_popup?popup_type=1&dialog_enqueue=0&pop_name=coin-buy-book&url=https%3A%2F%2Freading.snssdk.com%2Freading_offline%2Fdrlynx_monetize%2Fcoin-buy-book%2Ftemplate.js";
    this.ecomSearchUrl = "dragon1967://lynxview?hideLoading=2&hideNavigationBar=1&hideStatusBar=1&customBrightnessScheme=2&url=sslocal%3A%2F%2Flynxview%2F%3Fsurl%3Dhttps%253A%252F%252Freading.snssdk.com%252Freading_offline%252Fdrlynx_monetize%252Fecom-search%252Ftemplate.js";
    this.ecomSearchPageCardUrl = "sslocal://lynxview/?surl=https%3A%2F%2Freading.snssdk.com%2Freading_offline%2Fdrlynx_monetize%2Fecom-search-page-card%2Ftemplate.js";
    this.mixMallBookChannelUrl = "sslocal://lynxview/?surl=sslocal://lynxview/?surl=https%3A%2F%2Freading.snssdk.com%2Freading_offline%2Fdrlynx_monetize%2Fbuy-book%2Ftemplate.js%3Fecom_entrance_form%3Dreal_book_prd%26feed_force_insert_items%3D2_3672879059811041393%252C2_3675161414047236116%252C2_3679419300743086323%252C2_3669108291193143436%252C2_3618194808528585389%252C2_3662473465602130176%252C2_3685307000666849601%252C2_3621857623386774551%26from%3Dorder_homepage%26enter_from%3Dorder_homepage%26page_name%3Dreal_book%26retention_popup_type%3Dstore_real_books_retain%26scene%3D3%26tab_id%3D1%26tab_name%3D%25E5%25AE%259E%25E4%25BD%2593%25E4%25B9%25A6%26history_path%3Dmine_tab_order_page__order_homepage.modulerealbook";
    this.userRelationUrl = "dragon8662://lynxview?hideLoading=0&hideNavigationBar=1&hideStatusBar=1&customBrightnessScheme=1&loadingButHideByFront=1&url=sslocal%3A%2F%2Flynxview%3Fthread_strategy%3D2%26surl%3Dhttps%253A%252F%252Flf-normal-gr-sourcecdn.bytegecko.com%252Fobj%252Fbyte-gurd-source-gr%252Fnovel%252Fdr%252Ffe%252Fnrlynx_distribution%252Fuser-relation%252Ftemplate.js%253Fis_self%253D1%2526tabs%253D1%2526target_tab%253D1%2526title%253D%25E6%2588%2591%25E7%259A%2584%25E5%2585%25B3%25E6%25B3%25A8%26loader_name%3Dforest";
    this.userProfileUrl = "dragon8662://lynxview?hideLoading=0&hideNavigationBar=1&hideStatusBar=1&customBrightnessScheme=1&loadingButHideByFront=1&url=sslocal%3A%2F%2Flynxview%3Fthread_strategy%3D2%26surl%3Dhttps%253A%252F%252Flf-normal-gr-sourcecdn.bytegecko.com%252Fobj%252Fbyte-gurd-source-gr%252Fnovel%252Fdr%252Ffe%252Fnrlynx_distribution%252Fuser-profile%252Ftemplate.js%253Floader_name%3Dforest";
    this.imScriptDetailUrl = "https://reading.snssdk.com/reading_offline/drweb_community/page/script-detail.html";
    this.ugcVideoListUrl = "https://reading.snssdk.com/reading_offline/novelread/page/series-list-post-create.html";
    this.seriesPostButtonUrl = "sslocal://lynxview?surl=https%3A%2F%2Freading.snssdk.com%2Freading_offline%2Fnrlynx%2Fseries-post-btn%2Ftemplate.js";
    this.douyinMonthlyPayUrl = "sslocal://webcast_lynxview?hide_loading=0&show_error=1&trans_status_bar=1&hide_nav_bar=1&top_level=1&android_soft_input_mode=48&forbid_right_back=0&host=aweme&engine_type=new&disable_url_handle=1&type=popup&web_bg_color=transparent&merchant_id=800010000160013&app_id=NA202008272032554177543173&track_info=%7B%7D&source=pay_mkt_ug_ttlite_fix_35rw_bc&tea_source=pay_mkt_ug_ttlite_fix_35rw_bc&page_name=sdk_merge_account&url=https%3A%2F%2Flf-webcast-sourcecdn-tos.bytegecko.com%2Fobj%2Fbyte-gurd-source%2F10181%2Fgecko%2Fresource%2Fcj_lynx_cardbind%2Fmembersdk%2Ftemplate.js&mask_click_disable=0&gravity=bottom&input_smart_scroll=0&width_percent=100&is_caijing_saas=1&mask_alpha=0.2&add_safe_area_height=0&open_animate=1&fixed_height=1&height_percent=60&use_real_screen_height=0&disable_input_scroll=1&loader_name=forest&is_experi_ab_group=1&only_bind=1&saas_url=sslocal%3A%2F%2Fcjpay%3Fenable_font_scale%3D0%26is_caijing_saas%3D1%26canvas_mode%3D1%26url%3Dhttps%253A%252F%252Ff-cpay.snssdk.com%252Ffeoffline%252Fcpay%252Frouter.html%253Fcpsource%253Dcf_mpay_mpay_qt_changting_sx%2526canvas_mode%253D1%2526is_caijing_saas%253D1&saas_url_open_type=ttpay";
    this.douyinWalletUrl = "sslocal://webcast_lynxview?url=https%3A%2F%2Flf-normal-gr-sourcecdn.bytegecko.com%2Fobj%2Fbyte-gurd-source-gr%2Fwebcast%2Fwallet%2Flynx%2Fcaijing_lynx_wallet_home_v4%2Fmain%2Ftemplate.js&trans_status_bar=1&hide_nav_bar=1&support_exchange_theme=1&loader_name=forest&enable_code_cache=1&enable_latch=0&enable_preload=main&gateway=agw&screen_size_adaptation=1&host=aweme&enter_from=personal_homepage";
    this.searchRecBookRobotUsage = "sslocal://operationTopic?bookId=1234&topicId=7259381523781014331&reportFrom=%7B%22topic_id%22%3A%227259381523781014331%22%2C%22book_id%22%3A%221234%22%2C%22conversation_id%22%3A%221717900201428411%22%2C%22topic_position%22%3A%22im%22%7D&url=https%3A%2F%2Freading.snssdk.com%2Freading_offline%2Fdrweb_community%2Fpage%2Ftopic.html%3Fneed_report_button%3D1%26topic_id%3D7259381523781014331%26book_id%3D1234%26big_title%3D%25E5%2585%25AC%25E5%2591%258A%25E8%25AF%25A6%25E6%2583%2585";
    this.videoUgcPublishUrl = "dragon8662://webview?hideNavigationBar=1&disabledVerticalScrollBar=1&customBrightnessScheme=1&url=https%3A%2F%2Freading.snssdk.com%2Freading_offline%2Fnovelread%2Fpage%2Fupload-work.html%3F%26custom_brightness%3D1";
    this.defaultReaderAiLynxUrl = "sslocal://lynxview?customBrightnessScheme=1&surl=https://reading.snssdk.com/reading_offline/drlynx_distribution/ai-answer/template.js";
    this.defaultReaderAiInfoUrl = "sslocal://webview?customBrightnessScheme=1&disabledVerticalScrollBar=1&url=https%3A%2F%2Freading.snssdk.com%2Freading_offline%2Fdrlazy%2Fpage%2Fgeneral-rules.html%3Fpage_id%3D677cc6c3db2a990038bf453e%26title%3DAI%E6%9F%A5%E8%AF%A2%E5%8A%9F%E8%83%BD%E4%BD%BF%E7%94%A8%E9%A1%BB%E7%9F%A5%26custom_brightness%3D1";
    stringBuilder = new StringBuilder();
    stringBuilder.append(b.a);
    stringBuilder.append("://lynxview?hideLoading=0&hideNavigationBar=1&hideStatusBar=1&customBrightnessScheme=1&loadingButHideByFront=1&url=sslocal%3A%2F%2Flynxview%3Fthread_strategy%3D2%26surl%3Dhttps%253A%252F%252Flf-normal-gr-sourcecdn.bytegecko.com%252Fobj%252Fbyte-gurd-source-gr%252Fnovel%252Fdr%252Ffe%252Fnrlynx_distribution%252Fuser-relation%252Ftemplate.js%253Ftabs%253D1%252C2%2526target_tab%253D2%2526loader_name%3Dforest");
    this.TARGET_USER_FANS_PAGE_URL = stringBuilder.toString();
    stringBuilder = new StringBuilder();
    stringBuilder.append(b.a);
    stringBuilder.append("://lynxview?hideLoading=0&hideNavigationBar=1&hideStatusBar=1&customBrightnessScheme=1&loadingButHideByFront=1&url=sslocal%3A%2F%2Flynxview%3Fthread_strategy%3D2%26surl%3Dhttps%253A%252F%252Flf-normal-gr-sourcecdn.bytegecko.com%252Fobj%252Fbyte-gurd-source-gr%252Fnovel%252Fdr%252Ffe%252Fnrlynx_distribution%252Fuser-relation%252Ftemplate.js%253Ftabs%253D1%252C2%2526target_tab%253D1%2526loader_name%3Dforest");
    this.TARGET_USER_FOLLOW_PAGE_URL = stringBuilder.toString();
  }
  
  private String appendParamsForTargetUser(String paramString1, String paramString2, String paramString3, PageRecorder paramPageRecorder) {
    String str = Uri.parse(paramString1).getQueryParameter("url");
    paramString1 = replaceParameterInUrl(paramString1, "url", replaceParameterInUrl(str, "surl", Uri.parse(Uri.parse(str).getQueryParameter("surl")).buildUpon().appendQueryParameter("target_user_id", paramString2).appendQueryParameter("title", paramString3).build().toString()));
    paramString2 = encode(JSONUtils.toJson(paramPageRecorder));
    return Uri.parse(paramString1).buildUpon().appendQueryParameter("reportFrom", paramString2).build().toString();
  }
  
  private String encode(String paramString) {
    if (TextUtils.isEmpty(paramString))
      return paramString; 
    try {
      return URLEncoder.encode(paramString, "UTF-8");
    } catch (UnsupportedEncodingException unsupportedEncodingException) {
      LogWrapper.error("default", "WebUrlManager", "encode error, value = %s", new Object[] { paramString });
      return paramString;
    } 
  }
  
  private String getImRobotDetailPiaUrl() {
    ob ob = getWebUrlConfigModel();
    return (ob != null && !TextUtils.isEmpty(ob.ba)) ? ob.ba : "https://reading.snssdk.com/reading_offline/drweb_community_pia/page/robot-detail-pia.html";
  }
  
  private String getImRobotDetailUrl() {
    ob ob = getWebUrlConfigModel();
    return (ob != null && !TextUtils.isEmpty(ob.aZ)) ? ob.aZ : "https://reading.snssdk.com/reading_offline/drweb_community/page/robot-detail.html";
  }
  
  public static WebUrlManager getInstance() {
    // Byte code:
    //   0: getstatic com/dragon/read/hybrid/WebUrlManager.instance : Lcom/dragon/read/hybrid/WebUrlManager;
    //   3: ifnonnull -> 39
    //   6: ldc com/dragon/read/hybrid/WebUrlManager
    //   8: monitorenter
    //   9: getstatic com/dragon/read/hybrid/WebUrlManager.instance : Lcom/dragon/read/hybrid/WebUrlManager;
    //   12: ifnonnull -> 27
    //   15: new com/dragon/read/hybrid/WebUrlManager
    //   18: astore_0
    //   19: aload_0
    //   20: invokespecial <init> : ()V
    //   23: aload_0
    //   24: putstatic com/dragon/read/hybrid/WebUrlManager.instance : Lcom/dragon/read/hybrid/WebUrlManager;
    //   27: ldc com/dragon/read/hybrid/WebUrlManager
    //   29: monitorexit
    //   30: goto -> 39
    //   33: astore_0
    //   34: ldc com/dragon/read/hybrid/WebUrlManager
    //   36: monitorexit
    //   37: aload_0
    //   38: athrow
    //   39: getstatic com/dragon/read/hybrid/WebUrlManager.instance : Lcom/dragon/read/hybrid/WebUrlManager;
    //   42: areturn
    // Exception table:
    //   from	to	target	type
    //   9	27	33	finally
    //   27	30	33	finally
    //   34	37	33	finally
  }
  
  private String getPugcUserProfileUrl() {
    ob ob = getWebUrlConfigModel();
    return (ob != null && !StringUtils.isEmpty(ob.bt)) ? ob.bt : "dragon8662://lynxview?hideLoading=0&hideNavigationBar=1&hideStatusBar=1&customBrightnessScheme=1&loadingButHideByFront=1&url=sslocal%3A%2F%2Flynxview%3Fthread_strategy%3D2%26surl%3Dhttps%253A%252F%252Flf-normal-gr-sourcecdn.bytegecko.com%252Fobj%252Fbyte-gurd-source-gr%252Fnovel%252Fdr%252Ffe%252Fnrlynx_distribution%252Fuser-profile%252Ftemplate.js%253Floader_name%3Dforest";
  }
  
  private ob getWebUrlConfigModel() {
    return (ob)SsConfigMgr.getSettingValue(IWebUrlConfig.class);
  }
  
  private String replaceParameterInUrl(String paramString1, String paramString2, String paramString3) {
    Uri uri = Uri.parse(paramString1);
    Set set = uri.getQueryParameterNames();
    Uri.Builder builder = uri.buildUpon().clearQuery();
    for (String str2 : set) {
      String str1;
      if (TextUtils.equals(str2, paramString2)) {
        str1 = paramString3;
      } else {
        str1 = uri.getQueryParameter(str2);
      } 
      builder.appendQueryParameter(str2, str1);
    } 
    return builder.build().toString();
  }
  
  public String getActivityTopicEditorUrl() {
    ob ob = getWebUrlConfigModel();
    return (ob != null && !TextUtils.isEmpty(ob.ac)) ? ob.ac : "https://reading.snssdk.com/reading_offline/drweb_community/page/activity-topic-editor.html";
  }
  
  public String getAdvertisingControlUrl() {
    ob ob = getWebUrlConfigModel();
    return (ob != null && !TextUtils.isEmpty(ob.ae)) ? ob.ae : this.advertisingControlDefaultUrl;
  }
  
  public String getAgreementUrl() {
    ob ob = getWebUrlConfigModel();
    return (ob != null && !StringUtils.isEmpty(ob.a)) ? ob.a : this.agreementDefaultUrl;
  }
  
  public String getAppUserGuideUrl() {
    ob ob = getWebUrlConfigModel();
    return (ob != null && !StringUtils.isEmpty(ob.aE)) ? ob.aE : this.userGuideUrl;
  }
  
  public String getAppealUrl() {
    ob ob = getWebUrlConfigModel();
    return (ob != null && !TextUtils.isEmpty(ob.aj)) ? ob.aj : this.appealUrl;
  }
  
  public String getAuthorAgreement() {
    ob ob = getWebUrlConfigModel();
    return (ob != null && !TextUtils.isEmpty(ob.aG)) ? ob.aG : this.authorAgreement;
  }
  
  public String getAuthorCenterUrl() {
    ob ob = getWebUrlConfigModel();
    return (ob != null && !TextUtils.isEmpty(ob.F)) ? ob.F : this.authorCentre;
  }
  
  public String getAuthorPCAgreement() {
    ob ob = getWebUrlConfigModel();
    return (ob != null && !TextUtils.isEmpty(ob.aI)) ? ob.aI : this.authorPCAgreement;
  }
  
  public String getAuthorPCPrivacy() {
    ob ob = getWebUrlConfigModel();
    return (ob != null && !TextUtils.isEmpty(ob.aJ)) ? ob.aJ : this.authorPCPrivacy;
  }
  
  public String getAuthorPopularityRankUrl() {
    ob ob = getWebUrlConfigModel();
    return (ob != null && !TextUtils.isEmpty(ob.aU)) ? ob.aU : "https://reading.snssdk.com/reading_offline/drweb_community/page/author-popularity-rank.html";
  }
  
  public String getAuthorPrivacy() {
    ob ob = getWebUrlConfigModel();
    return (ob != null && !TextUtils.isEmpty(ob.aH)) ? ob.aH : this.authorPrivacy;
  }
  
  public String getBasicFunctionSwitchUrl() {
    return this.basicFunctionSwitchUrl;
  }
  
  public String getBeWriterEntryUrl() {
    ob ob = getWebUrlConfigModel();
    return (ob != null && !TextUtils.isEmpty(ob.x)) ? ob.x : this.becomeWriter;
  }
  
  public String getBlackHouseUrl() {
    ob ob = getWebUrlConfigModel();
    return (ob != null && !TextUtils.isEmpty(ob.P)) ? ob.P : this.blackHouse;
  }
  
  public String getBookCoinUrl() {
    ob ob = getWebUrlConfigModel();
    return (ob != null && !StringUtils.isEmpty(ob.bn)) ? ob.bn : "dragon1967://lynxview?customBrightnessScheme=1&hideLoading=1&hideNavigationBar=1&hideStatusBar=1&url=sslocal%3A%2F%2Flynxview%2F%3Fsurl%3Dhttps%253A%252F%252Freading.snssdk.com%252Freading_offline%252Fdrlynx_monetize%252Fpublish-book-coin%252Ftemplate.js%26prefix%3Dreading_offline";
  }
  
  public String getBookCommentEditorUrl() {
    ob ob = getWebUrlConfigModel();
    return (ob != null && !TextUtils.isEmpty(ob.V)) ? ob.V : "https://reading.snssdk.com/reading_offline/drweb_community/page/book-comment.html";
  }
  
  public String getBookCommentGuideUrl() {
    ob ob = getWebUrlConfigModel();
    return (ob != null && !TextUtils.isEmpty(ob.aD)) ? ob.aD : this.bookCommentGuideUrl;
  }
  
  public String getBookListEditorJsUrl() {
    ob ob = getWebUrlConfigModel();
    return (ob != null && !TextUtils.isEmpty(ob.aT)) ? ob.aT : "https://lf-cdn-tos.bytescm.com/obj/static/novel-dragon/feoffline/drweb/workers/editor-parser.worker.js";
  }
  
  public String getBookRewardFansRankUrl() {
    ob ob = getWebUrlConfigModel();
    return (ob != null && !TextUtils.isEmpty(ob.t)) ? ob.t : "";
  }
  
  public String getBookRewardRankUrl() {
    ob ob = getWebUrlConfigModel();
    return (ob != null && !TextUtils.isEmpty(ob.bd)) ? ob.bd : "https://reading.snssdk.com/reading_offline/drweb_community/page/praise-rank-list.html";
  }
  
  public String getBookRewardRecordUrl() {
    ob ob = getWebUrlConfigModel();
    return (ob != null && !TextUtils.isEmpty(ob.bf)) ? ob.bf : "https://reading.snssdk.com/reading_offline/drweb_community/page/reward-list.html";
  }
  
  public String getBookStoreTopicLandingPageToBookListUrl() {
    ob ob = getWebUrlConfigModel();
    return (ob != null && !TextUtils.isEmpty(ob.aV)) ? ob.aV : this.bookStoreTopicLandingPageToBookList;
  }
  
  public String getBookUploadHtmlZipUrl() {
    ob ob = getWebUrlConfigModel();
    return (ob != null && !TextUtils.isEmpty(ob.O)) ? ob.O : this.bookUploadHtmlZipUrl;
  }
  
  public String getBookWikiUrl() {
    ob ob = getWebUrlConfigModel();
    return (ob != null && !TextUtils.isEmpty(ob.bm)) ? ob.bm : "https://reading.snssdk.com/reading_offline/drweb_community/page/book-wiki.html";
  }
  
  public String getCSREntranceUrl() {
    ob ob = getWebUrlConfigModel();
    return (ob != null && !TextUtils.isEmpty(ob.aN)) ? ob.aN : (c.a((Context)App.context()) ? "sslocal://webcast_lynxview?type=fullscreen&url=https%3A%2F%2Ftosv.byted.org%2Fobj%2Fgecko-internal%2F10180%2Fgecko%2Fresource%2Fwelfare_app%2Fpages%2Fhome%2Ftemplate.js&engine_type=new&host=aweme&launch_mode=remove_same_page&status_bar_color=black&hide_nav_bar=1&trans_status_bar=1&web_bg_color=fff4f5f7&is_launch_page=1&use_latch_ng=1&enable_canvas=1" : "sslocal://webcast_lynxview?type=fullscreen&url=https%3A%2F%2Flf-webcast-sourcecdn-tos.bytegecko.com%2Fobj%2Fbyte-gurd-source%2F10181%2Fgecko%2Fresource%2Fwelfare_app%2Fpages%2Fhome%2Ftemplate.js&engine_type=new&host=aweme&launch_mode=remove_same_page&status_bar_color=black&hide_nav_bar=1&trans_status_bar=1&web_bg_color=fff4f5f7&is_launch_page=1&use_latch_ng=1&enable_canvas=1&source=solid");
  }
  
  public String getCatalogSimilarBookList() {
    ob ob = getWebUrlConfigModel();
    return (ob != null && !TextUtils.isEmpty(ob.aQ)) ? ob.aQ : "sslocal://lynxview/?surl=https%3A%2F%2Freading.snssdk.com%2Freading_offline%2Fdrlynx%2Fcatalog-similar-booklist%2Ftemplate.js%3Fcell_id%3D7199965756308586533";
  }
  
  public String getChangduPayWallWallLynxUrl() {
    ob ob = getWebUrlConfigModel();
    return (ob != null && !TextUtils.isEmpty(ob.ax)) ? ob.ax : "sslocal://lynxview/?surl=https%3A%2F%2Freading.snssdk.com%2Freading_offline%2Fcdlynx%2Fchangdu-pay-wall%2Ftemplate.js&prefix=reading_offline";
  }
  
  public String getChapterEndUrl() {
    ob ob = getWebUrlConfigModel();
    return (ob != null && !StringUtils.isEmpty(ob.b)) ? ob.b : this.chapterEndDefaultUrl;
  }
  
  public String getChildrenMessageProtectUrl() {
    ob ob = getWebUrlConfigModel();
    return (ob != null && !TextUtils.isEmpty(ob.as)) ? ob.as : this.childrenMessageProtectUrl;
  }
  
  public String getClockInHelpUrl() {
    ob ob = getWebUrlConfigModel();
    return (ob != null && !TextUtils.isEmpty(ob.Q)) ? ob.Q : this.clockInHelp;
  }
  
  public String getCloseAccountUrl() {
    ob ob = getWebUrlConfigModel();
    return (ob != null && !StringUtils.isEmpty(ob.y)) ? ob.y : this.closeAccountUrl;
  }
  
  public String getCoinBuyBookUrl() {
    ob ob = getWebUrlConfigModel();
    return (ob != null && !StringUtils.isEmpty(ob.bo)) ? ob.bo : "sslocal://lynx_popup?popup_type=1&dialog_enqueue=0&pop_name=coin-buy-book&url=https%3A%2F%2Freading.snssdk.com%2Freading_offline%2Fdrlynx_monetize%2Fcoin-buy-book%2Ftemplate.js";
  }
  
  public String getCommunityConventionUrl() {
    ob ob = getWebUrlConfigModel();
    return (ob != null && !TextUtils.isEmpty(ob.w)) ? ob.w : this.communityConventionUrl;
  }
  
  public String getContractEntryUrl() {
    ob ob = getWebUrlConfigModel();
    return (ob != null && !TextUtils.isEmpty(ob.p)) ? ob.p : this.contractEntrance;
  }
  
  public String getCreationIncomePageUrl() {
    ob ob = getWebUrlConfigModel();
    return (ob != null && !StringUtils.isEmpty(ob.aS)) ? ob.aS : this.creationIncomePageUrl;
  }
  
  public String getCsjShakeSettingUrl() {
    ob ob = getWebUrlConfigModel();
    return (ob != null && !TextUtils.isEmpty(ob.af)) ? ob.af : this.csjShakeSettingDefaultUrl;
  }
  
  public String getCustomerServiceUrl() {
    ob ob = getWebUrlConfigModel();
    return (ob != null && !TextUtils.isEmpty(ob.au)) ? ob.au : this.customerServiceUrl;
  }
  
  public String getDefaultAgreementUrl() {
    return this.agreementDefaultUrl;
  }
  
  public String getDefaultBasicDataUsageUrl() {
    return this.basicDataUsageUrl;
  }
  
  public String getDefaultChangduCommunitySaaSMessageUrl() {
    return this.communityChangduSaaSMessageEntryUrl;
  }
  
  public String getDefaultCommunitySaaSMessageEntryUrl() {
    return this.communitySaaSMessageEntryUrl;
  }
  
  public String getDefaultEggflowerCommunitySaaSMessageUrl() {
    return this.communityEggFlowerSaaSMessageEntryUrl;
  }
  
  public String getDefaultHongguoCommunitySaaSMessageUrl() {
    return this.communityHongguoSaaSMessageEntryUrl;
  }
  
  public String getDefaultPrivacyUrl() {
    return this.privacyDefaultUrl;
  }
  
  public String getDouyinLoginConflictUrl(i parami) {
    return NsUtilsDepend.IMPL.getDouyinLoginConfictUrl(parami);
  }
  
  public String getDouyinMonthlyPayUrl() {
    ob ob = getWebUrlConfigModel();
    return (ob != null && !TextUtils.isEmpty(ob.bA)) ? ob.bA : "sslocal://webcast_lynxview?hide_loading=0&show_error=1&trans_status_bar=1&hide_nav_bar=1&top_level=1&android_soft_input_mode=48&forbid_right_back=0&host=aweme&engine_type=new&disable_url_handle=1&type=popup&web_bg_color=transparent&merchant_id=800010000160013&app_id=NA202008272032554177543173&track_info=%7B%7D&source=pay_mkt_ug_ttlite_fix_35rw_bc&tea_source=pay_mkt_ug_ttlite_fix_35rw_bc&page_name=sdk_merge_account&url=https%3A%2F%2Flf-webcast-sourcecdn-tos.bytegecko.com%2Fobj%2Fbyte-gurd-source%2F10181%2Fgecko%2Fresource%2Fcj_lynx_cardbind%2Fmembersdk%2Ftemplate.js&mask_click_disable=0&gravity=bottom&input_smart_scroll=0&width_percent=100&is_caijing_saas=1&mask_alpha=0.2&add_safe_area_height=0&open_animate=1&fixed_height=1&height_percent=60&use_real_screen_height=0&disable_input_scroll=1&loader_name=forest&is_experi_ab_group=1&only_bind=1&saas_url=sslocal%3A%2F%2Fcjpay%3Fenable_font_scale%3D0%26is_caijing_saas%3D1%26canvas_mode%3D1%26url%3Dhttps%253A%252F%252Ff-cpay.snssdk.com%252Ffeoffline%252Fcpay%252Frouter.html%253Fcpsource%253Dcf_mpay_mpay_qt_changting_sx%2526canvas_mode%253D1%2526is_caijing_saas%253D1&saas_url_open_type=ttpay";
  }
  
  public String getDouyinPrivacyPolicyUrl() {
    ob ob = getWebUrlConfigModel();
    return (ob != null && !TextUtils.isEmpty(ob.aA)) ? ob.aA : this.douyinPrivacyPolicyUrl;
  }
  
  public String getDouyinPrivacyUrl() {
    ob ob = getWebUrlConfigModel();
    if (ob != null && !TextUtils.isEmpty(ob.ak)) {
      StringBuilder stringBuilder = new StringBuilder();
      stringBuilder.append(ob.ak);
      stringBuilder.append(QUERY_DOUYIN_AUTH_TITLE);
      return stringBuilder.toString();
    } 
    return this.douyinPrivacyUrl;
  }
  
  public String getDouyinUserProtocolUrl() {
    ob ob = getWebUrlConfigModel();
    return (ob != null && !TextUtils.isEmpty(ob.az)) ? ob.az : this.douyinUserProtocolUrl;
  }
  
  public String getDouyinWalletUrl() {
    ob ob = getWebUrlConfigModel();
    return (ob != null && !TextUtils.isEmpty(ob.bB)) ? ob.bB : "sslocal://webcast_lynxview?url=https%3A%2F%2Flf-normal-gr-sourcecdn.bytegecko.com%2Fobj%2Fbyte-gurd-source-gr%2Fwebcast%2Fwallet%2Flynx%2Fcaijing_lynx_wallet_home_v4%2Fmain%2Ftemplate.js&trans_status_bar=1&hide_nav_bar=1&support_exchange_theme=1&loader_name=forest&enable_code_cache=1&enable_latch=0&enable_preload=main&gateway=agw&screen_size_adaptation=1&host=aweme&enter_from=personal_homepage";
  }
  
  public String getEcomMallMixTabBookChannelUrl() {
    ob ob = getWebUrlConfigModel();
    return (ob != null && !StringUtils.isEmpty(ob.br)) ? ob.br : "sslocal://lynxview/?surl=sslocal://lynxview/?surl=https%3A%2F%2Freading.snssdk.com%2Freading_offline%2Fdrlynx_monetize%2Fbuy-book%2Ftemplate.js%3Fecom_entrance_form%3Dreal_book_prd%26feed_force_insert_items%3D2_3672879059811041393%252C2_3675161414047236116%252C2_3679419300743086323%252C2_3669108291193143436%252C2_3618194808528585389%252C2_3662473465602130176%252C2_3685307000666849601%252C2_3621857623386774551%26from%3Dorder_homepage%26enter_from%3Dorder_homepage%26page_name%3Dreal_book%26retention_popup_type%3Dstore_real_books_retain%26scene%3D3%26tab_id%3D1%26tab_name%3D%25E5%25AE%259E%25E4%25BD%2593%25E4%25B9%25A6%26history_path%3Dmine_tab_order_page__order_homepage.modulerealbook";
  }
  
  public String getEcomSearchPageCardUrl() {
    ob ob = getWebUrlConfigModel();
    return (ob != null && !StringUtils.isEmpty(ob.bq)) ? ob.bq : "sslocal://lynxview/?surl=https%3A%2F%2Freading.snssdk.com%2Freading_offline%2Fdrlynx_monetize%2Fecom-search-page-card%2Ftemplate.js";
  }
  
  public String getEcomSearchUrl() {
    ob ob = getWebUrlConfigModel();
    return (ob != null && !StringUtils.isEmpty(ob.bp)) ? ob.bp : "dragon1967://lynxview?hideLoading=2&hideNavigationBar=1&hideStatusBar=1&customBrightnessScheme=2&url=sslocal%3A%2F%2Flynxview%2F%3Fsurl%3Dhttps%253A%252F%252Freading.snssdk.com%252Freading_offline%252Fdrlynx_monetize%252Fecom-search%252Ftemplate.js";
  }
  
  public String getEggFlowerPayWallWallLynxUrl() {
    ob ob = getWebUrlConfigModel();
    return (ob != null && !TextUtils.isEmpty(ob.ay)) ? ob.ay : "sslocal://lynxview/?surl=https%3A%2F%2Freading.snssdk.com%2Freading_offline%2Fdhlynx%2Fchangdu-pay-wall%2Ftemplate.js&prefix=reading_offline";
  }
  
  public String getFanGroupsUrl() {
    ob ob = getWebUrlConfigModel();
    return (ob != null && !TextUtils.isEmpty(ob.bj)) ? ob.bj : "https://reading.snssdk.com/reading_offline/drweb_community/page/fan-groups.html";
  }
  
  public String getFansDescriptionUrl() {
    ob ob = getWebUrlConfigModel();
    return (ob != null && !TextUtils.isEmpty(ob.K)) ? ob.K : this.fansDescription;
  }
  
  public String getFansRankUrl() {
    ob ob = getWebUrlConfigModel();
    return (ob != null && !TextUtils.isEmpty(ob.N)) ? ob.N : this.fansRank;
  }
  
  public String getFaqUrl() {
    ob ob = getWebUrlConfigModel();
    return (ob != null && !TextUtils.isEmpty(ob.Z)) ? ob.Z : this.faqDefaultUrl;
  }
  
  public String getFeedBackUrl() {
    ob ob = getWebUrlConfigModel();
    return (ob != null && !StringUtils.isEmpty(ob.c)) ? ob.c : this.feedbackDefaultUrl;
  }
  
  public String getFeedbackEntryUrl() {
    ob ob = getWebUrlConfigModel();
    return (ob != null && !TextUtils.isEmpty(ob.k)) ? ob.k : this.feedbackEntryUrl;
  }
  
  public String getFinalImRobotDetailUrl(boolean paramBoolean) {
    return paramBoolean ? getImRobotDetailPiaUrl() : getImRobotDetailUrl();
  }
  
  public String getFollowUrl() {
    ob ob = getWebUrlConfigModel();
    return (ob != null && !TextUtils.isEmpty(ob.aB)) ? ob.aB : this.followUrl;
  }
  
  public String getForumOperatorUrl() {
    ob ob = getWebUrlConfigModel();
    return (ob != null && !TextUtils.isEmpty(ob.M)) ? ob.M : this.forumOperatorDetail;
  }
  
  public String getForwardDetailUrl() {
    ob ob = getWebUrlConfigModel();
    return (ob != null && !TextUtils.isEmpty(ob.aq)) ? ob.aq : "https://reading.snssdk.com/reading_offline/drweb_community/page/ugc-dynamic-detail.html";
  }
  
  public String getForwardEditorUrl() {
    ob ob = getWebUrlConfigModel();
    return (ob != null && !TextUtils.isEmpty(ob.U)) ? ob.U : "https://reading.snssdk.com/reading_offline/drweb_community/page/ugc-forward-editor.html";
  }
  
  public String getGraphicPrivacyUrl() {
    ob ob = getWebUrlConfigModel();
    return (ob != null && !TextUtils.isEmpty(ob.f)) ? ob.f : this.graphicPrivacyDefaultUrl;
  }
  
  public String getHelpUrl() {
    ob ob = getWebUrlConfigModel();
    return (ob != null && !StringUtils.isEmpty(ob.d)) ? ob.d : this.helpDefaultUrl;
  }
  
  public String getHotReadBookUrl() {
    ob ob = getWebUrlConfigModel();
    return (ob != null && !TextUtils.isEmpty(ob.ao)) ? ob.ao : this.hotReadBookUrl;
  }
  
  public String getImRobotAIList() {
    ob ob = getWebUrlConfigModel();
    return (ob != null && !TextUtils.isEmpty(ob.bh)) ? ob.bh : "dragon1967://webview?hideStatusBar=1&hideNavigationBar=1&customBrightnessScheme=1&url=https%3A%2F%2Freading.snssdk.com%2Freading_offline%2Fdrweb_community%2Fpage%2Frobot-ai-list.html";
  }
  
  public String getImRobotListUrl() {
    ob ob = getWebUrlConfigModel();
    return (ob != null && !TextUtils.isEmpty(ob.aY)) ? ob.aY : "https://reading.snssdk.com/reading_offline/drweb_community/page/robot-list.html";
  }
  
  public String getImScriptDetailUrl() {
    ob ob = getWebUrlConfigModel();
    return (ob != null && !TextUtils.isEmpty(ob.bx)) ? ob.bx : "https://reading.snssdk.com/reading_offline/drweb_community/page/script-detail.html";
  }
  
  public String getInviteAnswerListUrl() {
    ob ob = getWebUrlConfigModel();
    return (ob != null && !TextUtils.isEmpty(ob.av)) ? ob.av : "https://reading.snssdk.com/reading_offline/drweb/page/invite-answer.html";
  }
  
  public String getInviteAnswerUrl() {
    ob ob = getWebUrlConfigModel();
    return (ob != null && !TextUtils.isEmpty(ob.an)) ? ob.an : this.inviteAnswerUrl;
  }
  
  public String getLicenseUrl() {
    ob ob = getWebUrlConfigModel();
    return (ob != null && !StringUtils.isEmpty(ob.q)) ? ob.q : this.licenseDefaultUrl;
  }
  
  public String getMessageCenterV3() {
    String str;
    ob ob = getWebUrlConfigModel();
    if (ob != null && !TextUtils.isEmpty(ob.o)) {
      str = ob.o;
    } else {
      str = NsUtilsDepend.IMPL.getDefaultMsgCenterV3Url();
    } 
    LogWrapper.info("default", "WebUrlManager", "getMessageCenterV3: %s", new Object[] { str });
    return str;
  }
  
  public String getMineVipBannerUrl() {
    ob ob = getWebUrlConfigModel();
    return (ob != null && !StringUtils.isEmpty(ob.bg)) ? ob.bg : "sslocal://lynxview/?surl=https%3A%2F%2Freading.snssdk.com%2Freading_offline%2Fdrlynx_dynamic_card%2Fvip-tabs-card%2Ftemplate.js&prefix=reading_offline";
  }
  
  public String getMultiDeviceManageUrl() {
    ob ob = getWebUrlConfigModel();
    return (ob != null && !StringUtils.isEmpty(ob.z)) ? ob.z : this.multiDeviceManageUrl;
  }
  
  public String getMuteManageUrl() {
    ob ob = getWebUrlConfigModel();
    return (ob != null && !TextUtils.isEmpty(ob.aM)) ? ob.aM : this.muteManageUrl;
  }
  
  public String getMyFollowUrl() {
    ob ob = getWebUrlConfigModel();
    return (ob != null && !TextUtils.isEmpty(ob.I)) ? ob.I : this.myFollow;
  }
  
  public String getMyMessageEntryUrl() {
    String str = NsUtilsDepend.IMPL.getSaaSMsgCenterUrl();
    LogWrapper.info("default", "WebUrlManager", "getMyMessageEntryUrl: %s", new Object[] { str });
    if (!TextUtils.isEmpty(str))
      return str; 
    ob ob = getWebUrlConfigModel();
    return (ob != null && !TextUtils.isEmpty(ob.m)) ? ob.m : this.myMessageEntryUrl;
  }
  
  public String getMyOrderLynxUrl() {
    ob ob = getWebUrlConfigModel();
    return (ob != null && !TextUtils.isEmpty(ob.aL)) ? ob.aL : "sslocal://webcast_lynxview?type=fullscreen&url=https%3A%2F%2Flf-webcast-sourcecdn-tos.bytegecko.com%2Fobj%2Fbyte-gurd-source%2Fwebcast%2Ffalcon%2Fdongchedi%2Fecommerce_orders_dongchedi%2Fapp_new%2Ftemplate.js&hide_nav_bar=1&load_taro=0&trans_status_bar=1&status_bar_color=black&web_bg_color=ffffffff&host=aweme&needFqLogin=1";
  }
  
  public String getMyOrderUrl() {
    ob ob = getWebUrlConfigModel();
    return (ob != null && !TextUtils.isEmpty(ob.aK)) ? ob.aK : "sslocal://webcast_lynxview?type=fullscreen&url=https%3A%2F%2Flf-webcast-sourcecdn-tos.bytegecko.com%2Fobj%2Fbyte-gurd-source%2Fwebcast%2Fecom%2Flynx%2Fecom_mall_fanqie%2Fhome%2Ftemplate.js%3Fis_full%3D1%26enter_from%3Dmine_tab_order_page&hide_nav_bar=1&hide_status_bar=0&status_bar_color=black&trans_status_bar=1&hide_loading=1&enable_share=0&show_back=0&web_bg_color=%23ffffffff&top_level=1&show_close=0&load_taro=0&host=aweme";
  }
  
  public String getMyPublishUrl() {
    ob ob = getWebUrlConfigModel();
    return (ob != null && !TextUtils.isEmpty(ob.J)) ? ob.J : this.myPublish;
  }
  
  public String getMyTabMallIndependentLynxUrl() {
    ob ob = getWebUrlConfigModel();
    return (ob != null && !StringUtils.isEmpty(ob.bv)) ? ob.bv : "sslocal://lynxview/?surl=https%3A%2F%2Freading.snssdk.com%2Freading_offline%2Fdrlynx_dynamic_card%2Fecom-tabs-card%2Ftemplate.js&prefix=reading_offline";
  }
  
  public String getMyTabMallIndependentLynxUrlNew() {
    ob ob = getWebUrlConfigModel();
    return (ob != null && !StringUtils.isEmpty(ob.bw)) ? ob.bw : "sslocal://lynxview/?surl=https%3A%2F%2Freading.snssdk.com%2Freading_offline%2Fdrlynx_dynamic_card%2Fecom-tabs-card%2Ftemplate.js&prefix=reading_offline&enable_anniex=1";
  }
  
  public String getNewGiftAgreementUrl() {
    ob ob = getWebUrlConfigModel();
    return (ob != null && !TextUtils.isEmpty(ob.aX)) ? ob.aX : this.newGiftAgreementUrl;
  }
  
  public String getOpenSourceLicenseUrl() {
    ob ob = getWebUrlConfigModel();
    return (ob != null && !TextUtils.isEmpty(ob.am)) ? ob.am : "";
  }
  
  public String getOperationEntry() {
    ob ob = getWebUrlConfigModel();
    return (ob != null && !TextUtils.isEmpty(ob.G)) ? ob.G : "https://reading.snssdk.com/reading_offline/drweb_community/page/topic.html";
  }
  
  public String getPayWallLynxUrl() {
    ob ob = getWebUrlConfigModel();
    return (ob != null && !TextUtils.isEmpty(ob.aw)) ? ob.aw : "sslocal://lynxview/?surl=https%3A%2F%2Freading.snssdk.com%2Freading_offline%2Fdrlynx_monetize%2Fpay-wall%2Ftemplate.js&prefix=reading_offline";
  }
  
  public String getPayingAttentionUrl() {
    ob ob = getWebUrlConfigModel();
    return (ob != null && !TextUtils.isEmpty(ob.bk)) ? ob.bk : "https://reading.snssdk.com/reading_offline/drweb_community/page/paying-attention.html";
  }
  
  public String getPermissionListUrl() {
    return this.permissionListUrl;
  }
  
  public String getPersonInfoListUrl() {
    ob ob = getWebUrlConfigModel();
    return (ob != null && !TextUtils.isEmpty(ob.ai)) ? ob.ai : this.personalInfoListUrl;
  }
  
  public String getPersonalInformationUrl() {
    ob ob = getWebUrlConfigModel();
    return (ob != null && !TextUtils.isEmpty(ob.ah)) ? ob.ah : this.personalInformationUrl;
  }
  
  public String getPersonalRankingUrl() {
    ob ob = getWebUrlConfigModel();
    return (ob != null && !StringUtils.isEmpty(ob.aR)) ? ob.aR : this.personalRankingUrl;
  }
  
  public String getPersonalRecommendUrl() {
    ob ob = getWebUrlConfigModel();
    return (ob != null && !TextUtils.isEmpty(ob.ad)) ? ob.ad : this.personalRecommendDefaultUrl;
  }
  
  public String getPostFeedbackUrl() {
    ob ob = getWebUrlConfigModel();
    return (ob != null && !StringUtils.isEmpty(ob.j)) ? ob.j : "https://ic.snssdk.com/reading_offline/drweb/feedback-v3.html";
  }
  
  public String getPrivacyUrl() {
    ob ob = getWebUrlConfigModel();
    return (ob != null && !StringUtils.isEmpty(ob.e)) ? ob.e : this.privacyDefaultUrl;
  }
  
  public String getProfileDownloadUrl() {
    ob ob = getWebUrlConfigModel();
    return (ob != null && !TextUtils.isEmpty(ob.al)) ? ob.al : null;
  }
  
  public String getPugcAuthorFollowPageUrl() {
    ob ob = getWebUrlConfigModel();
    return (ob != null && !StringUtils.isEmpty(ob.bs)) ? ob.bs : "dragon8662://lynxview?hideLoading=0&hideNavigationBar=1&hideStatusBar=1&customBrightnessScheme=1&loadingButHideByFront=1&url=sslocal%3A%2F%2Flynxview%3Fthread_strategy%3D2%26surl%3Dhttps%253A%252F%252Flf-normal-gr-sourcecdn.bytegecko.com%252Fobj%252Fbyte-gurd-source-gr%252Fnovel%252Fdr%252Ffe%252Fnrlynx_distribution%252Fuser-relation%252Ftemplate.js%253Fis_self%253D1%2526tabs%253D1%2526target_tab%253D1%2526title%253D%25E6%2588%2591%25E7%259A%2584%25E5%2585%25B3%25E6%25B3%25A8%26loader_name%3Dforest";
  }
  
  public String getPugcUserProfileUrl(String paramString) {
    try {
      Uri uri1 = Uri.parse(getPugcUserProfileUrl());
      Uri uri2 = Uri.parse(uri1.getQueryParameter("url"));
      String str = Uri.parse(uri2.getQueryParameter("surl")).buildUpon().appendQueryParameter("target_user_id", paramString).build().toString();
      str = replaceParameterInUrl(uri2.toString(), "surl", str);
      return replaceParameterInUrl(uri1.toString(), "url", str);
    } catch (RuntimeException runtimeException) {
      StringBuilder stringBuilder = new StringBuilder();
      stringBuilder.append("[getPugcUserProfileUrl] error, target:");
      stringBuilder.append(paramString);
      LogWrapper.e("default", stringBuilder.toString(), new Object[0]);
      runtimeException.printStackTrace();
      return "";
    } 
  }
  
  public String getRankPageUrl() {
    ob ob = getWebUrlConfigModel();
    return (ob != null && !TextUtils.isEmpty(ob.C)) ? ob.C : this.rankPageUrl;
  }
  
  public String getReaderAiInfoUrl() {
    ob ob = getWebUrlConfigModel();
    return (ob != null && !TextUtils.isEmpty(ob.bF)) ? ob.bF : "sslocal://webview?customBrightnessScheme=1&disabledVerticalScrollBar=1&url=https%3A%2F%2Freading.snssdk.com%2Freading_offline%2Fdrlazy%2Fpage%2Fgeneral-rules.html%3Fpage_id%3D677cc6c3db2a990038bf453e%26title%3DAI%E6%9F%A5%E8%AF%A2%E5%8A%9F%E8%83%BD%E4%BD%BF%E7%94%A8%E9%A1%BB%E7%9F%A5%26custom_brightness%3D1";
  }
  
  public String getReaderAiLynxUrl() {
    ob ob = getWebUrlConfigModel();
    return (ob != null && !TextUtils.isEmpty(ob.bE)) ? ob.bE : "sslocal://lynxview?customBrightnessScheme=1&surl=https://reading.snssdk.com/reading_offline/drlynx_distribution/ai-answer/template.js";
  }
  
  public String getRegisterAgreementUrl() {
    ob ob = getWebUrlConfigModel();
    return (ob != null && !StringUtils.isEmpty(ob.bu)) ? ob.bu : this.registerAgreementDefaultUrl;
  }
  
  public String getReportGuestProfileUrl(String paramString) {
    Uri.Builder builder = new Uri.Builder();
    HashMap<Object, Object> hashMap = new HashMap<Object, Object>();
    hashMap.put("userId", paramString);
    paramString = JSONUtils.safeJsonString(hashMap);
    return builder.scheme("sslocal").authority("lynx_popup").appendQueryParameter("pop_name", "user-profile-operate-popup").appendQueryParameter("soft_input_mode", "16").appendQueryParameter("enable_android_back", "0").appendQueryParameter("customBrightnessScheme", "1").appendQueryParameter("first_frame_data", paramString).appendQueryParameter("url", "https://lf-normal-gr-sourcecdn.bytegecko.com/obj/byte-gurd-source-gr/novel/dr/fe/nrlynx_distribution/user-profile-operate-popup/template.js?dr_brightness=light").build().toString();
  }
  
  public String getReqBookTopicUrl() {
    ob ob = getWebUrlConfigModel();
    return (ob != null && !TextUtils.isEmpty(ob.L)) ? ob.L : this.reqBookTopicDetail;
  }
  
  public String getRewardRankRuleUrl() {
    ob ob = getWebUrlConfigModel();
    return (ob != null && !TextUtils.isEmpty(ob.s)) ? ob.s : this.rewardRankRule;
  }
  
  public String getRewardRankUrl() {
    ob ob = getWebUrlConfigModel();
    return (ob != null && !TextUtils.isEmpty(ob.v)) ? ob.v : this.rewardRank;
  }
  
  public String getRewardRuleUrl() {
    ob ob = getWebUrlConfigModel();
    return (ob != null && !TextUtils.isEmpty(ob.r)) ? ob.r : this.rewardRule;
  }
  
  public String getRewardWallUrl() {
    ob ob = getWebUrlConfigModel();
    return (ob != null && !TextUtils.isEmpty(ob.u)) ? ob.u : this.rewardWall;
  }
  
  public String getSaaSBookCommentEditorUrl() {
    ob ob = getWebUrlConfigModel();
    return (ob != null && !StringUtils.isEmpty(ob.be)) ? ob.be : "https://reading.snssdk.com/reading_offline/drweb_community/page/book-comment.html";
  }
  
  public String getSaaSMessageEntryUrl(String paramString) {
    ob ob = getWebUrlConfigModel();
    if (ob != null && !TextUtils.isEmpty(ob.n)) {
      paramString = ob.n;
    } else if (TextUtils.isEmpty(paramString)) {
      paramString = this.communitySaaSMessageEntryUrl;
    } 
    Uri uri2 = Uri.parse(paramString);
    String str = uri2.getQueryParameter("url");
    Uri uri1 = uri2;
    if (!TextUtils.isEmpty(str))
      uri1 = c.a(uri2, "url", c.a(Uri.parse(str), "im_miss", "1").toString()); 
    return uri1.toString();
  }
  
  public String getSearchRecBookRobotUsage() {
    ob ob = getWebUrlConfigModel();
    return (ob != null && !TextUtils.isEmpty(ob.bC)) ? ob.bC : "sslocal://operationTopic?bookId=1234&topicId=7259381523781014331&reportFrom=%7B%22topic_id%22%3A%227259381523781014331%22%2C%22book_id%22%3A%221234%22%2C%22conversation_id%22%3A%221717900201428411%22%2C%22topic_position%22%3A%22im%22%7D&url=https%3A%2F%2Freading.snssdk.com%2Freading_offline%2Fdrweb_community%2Fpage%2Ftopic.html%3Fneed_report_button%3D1%26topic_id%3D7259381523781014331%26book_id%3D1234%26big_title%3D%25E5%2585%25AC%25E5%2591%258A%25E8%25AF%25A6%25E6%2583%2585";
  }
  
  public String getSearchTopicLynxUrl() {
    ob ob = getWebUrlConfigModel();
    return (ob != null && !TextUtils.isEmpty(ob.ag)) ? ob.ag : "sslocal://lynxview?surl=https%3A%2F%2Freading.snssdk.com%2Freading_offline%2Fdrlynx%2Fsearch-topic-list%2Ftemplate.js&prefix=reading_offline&thread_strategy=2";
  }
  
  public String getSelectQuestionListUrl() {
    ob ob = getWebUrlConfigModel();
    return (ob != null && !TextUtils.isEmpty(ob.bl)) ? ob.bl : "https://reading.snssdk.com/reading_offline/drweb_community/page/select-question-list.html";
  }
  
  public String getSelectQuestionUrl() {
    ob ob = getWebUrlConfigModel();
    return (ob != null && !TextUtils.isEmpty(ob.aW)) ? ob.aW : "dragon1967://webview?enterAnim=3&loadingButHideByFront=1&hideNavigationBar=1&bounceDisable=1&hideStatusBar=1&customBrightnessScheme=1";
  }
  
  public String getSelfExcerpt() {
    ob ob = getWebUrlConfigModel();
    return (ob != null && !TextUtils.isEmpty(ob.aF)) ? ob.aF : "sslocal://lynxview/?surl=https%3A%2F%2Freading.snssdk.com%2Freading_offline%2Fdrlynx%2Fself-excerpt%2Ftemplate.js%3Flimit%3D10%26offset%3D0%0A";
  }
  
  public String getSerialAreaUrl() {
    ob ob = getWebUrlConfigModel();
    return (ob != null && !TextUtils.isEmpty(ob.E)) ? ob.E : this.serialArea;
  }
  
  public String getSeriesPostButtonUrl() {
    ob ob = getWebUrlConfigModel();
    return (ob != null && !TextUtils.isEmpty(ob.bz)) ? ob.bz : "sslocal://lynxview?surl=https%3A%2F%2Freading.snssdk.com%2Freading_offline%2Fnrlynx%2Fseries-post-btn%2Ftemplate.js";
  }
  
  public String getStorageNotEnoughUrl() {
    ob ob = getWebUrlConfigModel();
    return (ob != null && !TextUtils.isEmpty(ob.B)) ? ob.B : this.storageNotEnough;
  }
  
  public String getStoryDetailUrl() {
    ob ob = getWebUrlConfigModel();
    return (ob != null && !TextUtils.isEmpty(ob.ar)) ? ob.ar : "https://reading.snssdk.com/reading_offline/drweb_community/page/ugc-story-detail.html";
  }
  
  public String getStoryTemplateUrl() {
    ob ob = getWebUrlConfigModel();
    return (ob != null && !TextUtils.isEmpty(ob.aC)) ? ob.aC : "sslocal://lynxview?thread_strategy=2&surl=https%3A%2F%2Freading.snssdk.com%2Freading_offline%2Fdrlynx_community%2Feditor-story-template-tab%2Ftemplate.js";
  }
  
  public String getStroyQuestionEditorUrl() {
    ob ob = getWebUrlConfigModel();
    return (ob != null && !TextUtils.isEmpty(ob.ab)) ? ob.ab : "https://reading.snssdk.com/reading_offline/drweb_community/page/story-question-editor.html";
  }
  
  public String getTargetUserFansPageUrl(String paramString1, String paramString2, PageRecorder paramPageRecorder) {
    return appendParamsForTargetUser(this.TARGET_USER_FANS_PAGE_URL, paramString1, paramString2, paramPageRecorder);
  }
  
  public String getTargetUserFollowPageUrl(String paramString1, String paramString2, PageRecorder paramPageRecorder) {
    return appendParamsForTargetUser(this.TARGET_USER_FOLLOW_PAGE_URL, paramString1, paramString2, paramPageRecorder);
  }
  
  public String getTeenModePasswordFeedback() {
    ob ob = getWebUrlConfigModel();
    if (ob != null && !TextUtils.isEmpty(ob.l))
      return ob.l; 
    StringBuilder stringBuilder = new StringBuilder();
    stringBuilder.append(this.appealUrl);
    stringBuilder.append("&allowTeenModeOpen=1");
    return stringBuilder.toString();
  }
  
  public String getThirdPartySDKUrl() {
    ob ob = getWebUrlConfigModel();
    return (ob != null && !TextUtils.isEmpty(ob.H)) ? ob.H : this.thirdPartySDKDefaultUrl;
  }
  
  public String getTopicInviteAnswerUrl() {
    ob ob = getWebUrlConfigModel();
    return (ob != null && !TextUtils.isEmpty(ob.bb)) ? ob.bb : "dragon1967://webview?enterAnim=3&loadingButHideByFront=1&hideNavigationBar=1&hideStatusBar=1&url=https%3A%2F%2Freading.snssdk.com%2Freading_offline%2Fdrweb%2Fpage%2Ftopic-invite-answer-v2.html&enterAnim=3";
  }
  
  public String getTopicPostDetailWebUtl() {
    ob ob = getWebUrlConfigModel();
    return (ob != null && !TextUtils.isEmpty(ob.R)) ? ob.R : NsUtilsDepend.IMPL.getUgcTopicPostUrl();
  }
  
  public String getTopicWithCoinRulesUrl() {
    ob ob = getWebUrlConfigModel();
    return (ob != null && !TextUtils.isEmpty(ob.ap)) ? ob.ap : this.topicWithCoinRules;
  }
  
  public String getUgcBookListUrl() {
    ob ob = getWebUrlConfigModel();
    return (ob != null && !TextUtils.isEmpty(ob.at)) ? ob.at : "https://reading.snssdk.com/reading_offline/drweb/page/book-list-post-create.html";
  }
  
  public String getUgcEditorUrl() {
    ob ob = getWebUrlConfigModel();
    return (ob != null && !TextUtils.isEmpty(ob.S)) ? ob.S : "https://reading.snssdk.com/reading_offline/drweb_community/page/topic-post-create-v2.html";
  }
  
  public String getUgcPostDetailUrl() {
    ob ob = getWebUrlConfigModel();
    return (ob != null && !TextUtils.isEmpty(ob.W)) ? ob.W : "https://reading.snssdk.com/reading_offline/drweb_community/page/ugc-post-detail.html";
  }
  
  public String getUgcTopicEditorUrl() {
    ob ob = getWebUrlConfigModel();
    return (ob != null && !TextUtils.isEmpty(ob.aa)) ? ob.aa : "https://reading.snssdk.com/reading_offline/drweb/page/topic-create.html";
  }
  
  public String getUgcTopicPostEditorUrl() {
    ob ob = getWebUrlConfigModel();
    return (ob != null && !TextUtils.isEmpty(ob.T)) ? ob.T : "https://reading.snssdk.com/reading_offline/drweb_community/page/topic-post-create-v3.html";
  }
  
  public String getUgcVideoListUrl() {
    ob ob = getWebUrlConfigModel();
    return (ob != null && !TextUtils.isEmpty(ob.by)) ? ob.by : "https://reading.snssdk.com/reading_offline/novelread/page/series-list-post-create.html";
  }
  
  public String getUnblockUrl() {
    ob ob = getWebUrlConfigModel();
    return (ob != null && !StringUtils.isEmpty(ob.D)) ? ob.D : this.unblockUrl;
  }
  
  public String getUrgeHelpUrl() {
    ob ob = getWebUrlConfigModel();
    return (ob != null && !StringUtils.isEmpty(ob.A)) ? ob.A : this.urgeHepleUrl;
  }
  
  public String getVideoCreativeTaskPageUrl() {
    ob ob = getWebUrlConfigModel();
    return (ob != null && !TextUtils.isEmpty(ob.bi)) ? ob.bi : "dragon1967://webview?bounceDisable=1&needFqLogin=1&customBrightnessScheme=1&loadingButHideByFront=1&hideNavigationBar=1&hideStatusBar=1&url=https%3A%2F%2Freading.snssdk.com%2Freading_offline%2Fdrweb_community%2Fpage%2Fcreative-task-detail.html%3Ftask_id%3D7304212942680457255%26custom_brightness%3D1%26entrance%3Dcreative_center%26task_entrance%3Dvideo_editor%26hide_task_btn%3D1";
  }
  
  public String getVideoUgcPublishUrl() {
    ob ob = getWebUrlConfigModel();
    return (ob != null && !TextUtils.isEmpty(ob.bD)) ? ob.bD : "dragon8662://webview?hideNavigationBar=1&disabledVerticalScrollBar=1&customBrightnessScheme=1&url=https%3A%2F%2Freading.snssdk.com%2Freading_offline%2Fnovelread%2Fpage%2Fupload-work.html%3F%26custom_brightness%3D1";
  }
  
  public String getVipHalfPageUrl() {
    ob ob = getWebUrlConfigModel();
    return (ob != null && !StringUtils.isEmpty(ob.aP)) ? ob.aP : "sslocal://lynx_popup?pop_name=vip-halfpage-popup&url=https%3A%2F%2Freading.snssdk.com%2Freading_offline%2Fdrlynx_monetize%2Fvip-halfpage-popup%2Ftemplate.js";
  }
  
  public String getVipHalfPageUrlHg() {
    ob ob = getWebUrlConfigModel();
    return (ob != null && !StringUtils.isEmpty(ob.aP)) ? ob.aP : "sslocal://lynx_popup?pop_name=vip-halfpage-popup&popup_type=1&url=https%3A%2F%2Freading.snssdk.com%2Freading_offline%2Fnrlynx%2Fvip-halfpage-popup%2Ftemplate.js";
  }
  
  public String getVipPageUrl() {
    ob ob = getWebUrlConfigModel();
    return (ob != null && !StringUtils.isEmpty(ob.aO)) ? ob.aO : this.vipPageDefaultUrl;
  }
  
  public String getVipPageUrlHg() {
    ob ob = getWebUrlConfigModel();
    return (ob != null && !StringUtils.isEmpty(ob.aO)) ? ob.aO : "dragon8662://lynxview?hideLoading=0&hideNavigationBar=1&hideStatusBar=1&customBrightnessScheme=0&url=sslocal%3A%2F%2Flynxview%2F%3Fsurl%3Dhttps%253A%252F%252Freading.snssdk.com%252Freading_offline%252Fnrlynx%252Fvip-page%252Ftemplate.js%26dr_brightness%3Dlight";
  }
  
  public String getVipPayResultUrl() {
    ob ob = getWebUrlConfigModel();
    return (ob != null && !StringUtils.isEmpty(ob.g)) ? ob.g : this.vipPayResultDefaultUrl;
  }
  
  public String getVipPayUrl() {
    return getVipPageUrl();
  }
  
  public String getVipPopupUrl() {
    return getVipHalfPageUrl();
  }
}
