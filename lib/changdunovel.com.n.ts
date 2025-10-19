import { assert } from "node:console";
export { default } from './fanqienovel.com.n.ts';

interface NovelData {
    code: number;
    message: string;
    data: {
        abstract: string;
        author: string;
        book_id: string;
        book_name: string;
        category: string;
        copyright_info: string;
        create_time: string;
        creation_status: string;
        genre: string;
        platform: string;
        read_count: string;
        serial_count: string;
        source: string;
        tags: string;
        thumb_url: string;
        total_price: string;
        type: string;
        tts_status: string;
        genre_type: string;
        word_number: string;
        score: string;
        exclusive: string;
        role: string;
        category_schema: string;
        tomato_book_status: string;
        related_audio_bookids: string;
        book_type: string;
        gender: string;
        is_ebook: string;
        listen_count: string;
        sub_info: string;
        last_publish_time: string;
        authorize_type: string;
        media_id: string;
        original_book_name: string;
        contents: string[];
        item_list: string[];
        item_names: string[];
        length_type: string;
        op_tag: string;
        keep_publish_days: string;
        thumb_uri: string;
        horiz_thumb_url: string;
        audio_thumb_uri: string;
        data_rate: string;
        all_bookshelf_count: string;
        pure_category_tags: string;
        visibility_info: string;
        is_laobai: string;
        show_vip_tag: null;
        color_dominate: string;
        read_count_all: string;
        shelf_cnt_history: string;
        first_online_time: string;
        expand_thumb_url: string;
        reading_gift_permission: string;
        platform_book_id: string;
        poster_id: string;
        sub_genre: string;
        audio_thumb_url_hd: string;
        flight_user_selected: string;
        top_right_icon: null;
        sub_title_extra_list: null;
        sub_title: string;
        book_abstract_v2: string;
        read_cnt_text: string;
    };
    extra: Record<string, unknown>;
}

export const getInfo = async (u: URL) => {
    const apiU = new URL(u.search, 'https://changdunovel.com/reading/bookapi/share/detail/v1'),
        apiR = await fetch(apiU).then(r => r.json() as Promise<NovelData>);

    assert(apiR.code === 0, `Failed to get novel data: ${apiR.message}`);
    return {
        firstPage: new URL(apiR.data.item_list[0], 'https://fanqienovel.com/reader/'),
        author: apiR.data.author,
        book_name: apiR.data.book_name,
        summary: apiR.data.abstract,
        cover: apiR.data.audio_thumb_uri
    } satisfies MainInfoResult
}