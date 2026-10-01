import signer

def get_book_info(book_id: str):
    url = f"https://api5-normal-sinfonlinea.fqnovel.com/reading/bookapi/detail/v?without_video=false&" + \
        "book_id=%s&iid=3819042126971481" + \
        "&device_id=3819042126721625&ac=wifi&channel=43536163a&aid=1967&app_name=novelapp&version_code=67732&version_name=6.7.7.32&device_platform=android&os=android" + \
        "&ssmix=a&device_type=Virtual+Machine&device_brand=Android-x86&language=zh&os_api=25&os_version=7.1.2&manifest_version_code=67732&resolution=1152*816" + \
        "&dpi=160&update_version_code=67732&_rticket=1751168662582&pv_player=67732&is_android_pad_screen=1&&rom_version=android_x86_64-userdebug+7.1.2+N2G48H+eng.cw_hua.20210214.062339+test-keys&" +\
        "player_so_load=1&compliance_status=0&host_abi=armeabi-v7a&need_personal_recommend=1&dragon_device_type=pad&cdid=fee1b512-de0b-42ed-9d40-1e0da3d9c629" \
        % (book_id)

h = signer.get({
  "accept": "application/json; charset=utf-8",
  "x-xs-from-web": "0",
  "x-reading-request": "1751168662586-271304738",
  "x-vc-bdturing-sdk-version": "3.7.2.cn",
  "lc": "101",
  "passport-sdk-version": "50564",
  "sdk-version": "2",
  "x-tt-store-region": "cn-zj",
  "x-tt-store-region-src": "did",
  "user-agent": "com.dragon.read/67732 (Linux; U; Android 7.1.2; zh_CN_#Hans; Virtual Machine; Build/N2G48H;tt-ok/3.12.13.4-tiktok)",
  "x-medusa": "k7ZgaIXZ4B1xM9JeL13korV9I4A8EAABLZkwB8APEQYrGjonawdhUA1atN0NSSgOjIHdLOUcZnoz2AqGRtf8cllXMI/PXK/Fmz1ih02HLx3A/UFrk2sKy5Zy83DeGIJUfMW7ryEGEbN/0Tz+5JLOuN+6Cp/7DyRxEmnJRzQTcO3gZaF7yohx6IwkI+auYPIGEM+58/ZMTWC6CElYlCmYR8gPJ4nGaS7v2jlbkdDFsK/pMGtVh394bFUELWaUutWfA+HryaQfEEJoKmhITvF2qg0Cfjh9lHpppWi4Lg27BRzuiKxHK8qILomjDPR+TiJfJsVaXI/hIQnTRbyRI496y2ffT9BplA/QCh3AGw66RX0dyPuBWw1eorp7xx3hvMyQwrNaozyGW9x4uwDDwegoyPKnA5cZozSWJu8/JtCReSo+I1jAQSZAjngRmhEryVZl7Eco94/Es+zf7mqvl5mhBQAJ+glJMgNu2oPifLUFAlzSU5rSPtDTzf/hkJ4XC+Byndf2YpWOb0l/b7iiOFTVEBInXX18bUDzy985M3lwUVCKGiAiyxMYEGMyak7uzcVveM9Y92ipis8okrIwUjxkFzpDPMx8QR1I16ZpCe8bzqU+fPcMUGCo1UBmlw71Ia/Xvno/h+IdJasmEZxNNEmEEC6URKovMqEYZtr27acFp6JQ/Z2Tt//NlTi9D8+nSzJuk1iuv4C8iOovuNQ4KlD7V/4yle2sFMHwEMiyrQF0+kXXJ/bG6Bkq/JlrxuTIfxV0syVNihu0+sdIryC8Yf+A94G6802RbIQZT2Cf4goFsRFWvYYfBL/0PHsHIetMhEYnnnLv43N58pbaojfCwSiTlhmwOwxAN8NCRCd6qf072+DO1ycbWYpSnT8eNX96lUHoA/SfWGM2qHaNb78cBVAYqdcVyyOjnxEAPMRyiYXHgLkcgWs+oKV0BohwlupS1Dtht4TctFeQGnKQnFPj1d/QACGHwc4s89RUZjMIJkxsv6CyuWYFpRLGc1qt5v3qaE1D2/LzCjvqjv8REXlditsemD1fwUvVcde/1gO9fvOZrYusP1Ltym4gDYQI4YU9EjH9r5f//a+Wv0og",
  "x-helios": "A/ByLIV9VWmfavCYt4fYbrPOByTGrTEdtcEt8Sc9fYzSoPdH",
  "x-soter": "AAEAAgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  "cookie": "passport_csrf_token_default=d1693cb50d73146ee94b02461f527d29; odin_tt=bf9018b69a56442f08e5c45b43d6c538ff4dd3b26a88f7e68a4d1921eb86656bfbc6420b6822efcf424f2ea62859d846e9d87b4ada6a9d9aa12f019c7797adf39330fc5a28c092b541b65ee36b2ebfab; install_id=3819042126971481; ttreq=1$76c4ada5066f7f581c999c223c4c37c221ee7390; store-region=cn-zj; store-region-src=did"
})
