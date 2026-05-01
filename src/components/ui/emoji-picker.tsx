"use client";

import { useState, useRef, useEffect } from "react";

const EMOJI_DATA: { category: string; items: { e: string; k: string }[] }[] = [
  {
    category: "😊 스마일 · 감정",
    items: [
      { e: "😀", k: "웃음 smile 기쁨" }, { e: "😃", k: "웃음 기쁨 행복" }, { e: "😄", k: "웃음 기쁨 smile" },
      { e: "😁", k: "씩 웃음 grin" }, { e: "😆", k: "웃음 ㅋㅋ laugh" }, { e: "😊", k: "부끄 웃음 blush" },
      { e: "🥰", k: "사랑 하트 love" }, { e: "😍", k: "반함 눈하트 love" }, { e: "🤩", k: "신남 별눈 star struck" },
      { e: "🥳", k: "파티 축하 party" }, { e: "😎", k: "쿨 선글라스 cool" }, { e: "🤓", k: "공부 안경 nerd" },
      { e: "🧐", k: "탐구 모노클 curious" }, { e: "🤔", k: "생각 고민 thinking" }, { e: "🤗", k: "안아 포옹 hug" },
      { e: "😇", k: "천사 착함 angel" }, { e: "🥹", k: "감동 눈물 touched" }, { e: "😌", k: "평온 안도 relieved" },
      { e: "😏", k: "씩 웃음 smirk" }, { e: "🙂", k: "미소 slight smile" }, { e: "😐", k: "무표정 neutral" },
      { e: "😴", k: "졸음 수면 sleep" }, { e: "🤯", k: "충격 폭발 mind blown" }, { e: "😤", k: "뿜 분노 triumph" },
      { e: "🥺", k: "애원 puppy eyes" }, { e: "😢", k: "슬픔 눈물 cry" }, { e: "😂", k: "웃겨 눈물 lol" },
      { e: "🤣", k: "폭소 rolling laugh" }, { e: "😅", k: "식은땀 sweat smile" }, { e: "😬", k: "민망 grimace" },
      { e: "🤪", k: "신남 zany" }, { e: "🥸", k: "변장 disguise" }, { e: "🤑", k: "돈 money mouth" },
      { e: "😈", k: "악마 devil smiling" }, { e: "👻", k: "유령 ghost" }, { e: "💀", k: "해골 skull" },
      { e: "🤡", k: "광대 clown" }, { e: "💩", k: "응가 poop" }, { e: "👽", k: "외계인 alien" },
    ],
  },
  {
    category: "👋 손 · 몸",
    items: [
      { e: "👋", k: "안녕 손흔들기 wave" }, { e: "🤚", k: "손 올리기 raised hand" }, { e: "✋", k: "손 stop" },
      { e: "🖐️", k: "손 five fingers" }, { e: "👌", k: "OK 오케이" }, { e: "✌️", k: "브이 승리 peace" },
      { e: "🤞", k: "행운 crossed fingers" }, { e: "🤙", k: "전화 call me shaka" }, { e: "👈", k: "왼쪽 포인팅" },
      { e: "👉", k: "오른쪽 포인팅" }, { e: "👆", k: "위 포인팅" }, { e: "👇", k: "아래 포인팅" },
      { e: "☝️", k: "하나 포인팅 one" }, { e: "👍", k: "좋아요 thumbs up" }, { e: "👎", k: "싫어요 thumbs down" },
      { e: "✊", k: "주먹 fist" }, { e: "👊", k: "주먹 punch" }, { e: "🤛", k: "왼쪽 주먹" },
      { e: "🤜", k: "오른쪽 주먹" }, { e: "🤝", k: "악수 handshake" }, { e: "🙏", k: "감사 기도 pray" },
      { e: "🙌", k: "만세 박수 raising hands" }, { e: "👏", k: "박수 clap applause" }, { e: "💪", k: "근육 힘 flex strong" },
      { e: "🦾", k: "로봇팔 mechanical arm" }, { e: "🦵", k: "다리 leg" }, { e: "🦶", k: "발 foot" },
      { e: "👀", k: "눈 eyes 보기" }, { e: "👁️", k: "눈 eye" }, { e: "👃", k: "코 nose" },
      { e: "👄", k: "입술 lips mouth" }, { e: "🧠", k: "뇌 brain 생각 지능" }, { e: "🦷", k: "치아 tooth" },
    ],
  },
  {
    category: "👩 사람",
    items: [
      { e: "👶", k: "아기 baby" }, { e: "🧒", k: "어린이 child" }, { e: "👧", k: "여자아이 girl" },
      { e: "👦", k: "남자아이 boy" }, { e: "👩", k: "여자 woman" }, { e: "👨", k: "남자 man" },
      { e: "🧑", k: "사람 person" }, { e: "👩‍🎓", k: "여학생 졸업 student" }, { e: "👨‍🎓", k: "남학생 졸업" },
      { e: "👩‍🏫", k: "여선생님 teacher" }, { e: "👨‍🏫", k: "남선생님 teacher" }, { e: "🧑‍💻", k: "개발자 코더 coder" },
      { e: "👩‍💻", k: "여개발자 programmer" }, { e: "👨‍💻", k: "남개발자 programmer" }, { e: "👩‍🔬", k: "여과학자 scientist" },
      { e: "👨‍🔬", k: "남과학자 scientist" }, { e: "👩‍🎨", k: "여화가 artist" }, { e: "👨‍🎨", k: "남화가 artist" },
      { e: "👩‍🍳", k: "여요리사 chef cook" }, { e: "👨‍🍳", k: "남요리사 chef" }, { e: "🧙‍♀️", k: "마녀 witch" },
      { e: "🧙‍♂️", k: "마법사 wizard" }, { e: "🦸‍♀️", k: "여슈퍼히어로 superhero" }, { e: "🦸‍♂️", k: "남슈퍼히어로" },
      { e: "👨‍👩‍👧", k: "가족 family 엄마아빠딸" }, { e: "👨‍👩‍👦", k: "가족 family 엄마아빠아들" }, { e: "👪", k: "가족 family" },
      { e: "🧑‍🤝‍🧑", k: "친구 friends couple" }, { e: "🕵️", k: "탐정 detective" }, { e: "👷", k: "건설 worker helmet" },
    ],
  },
  {
    category: "🐱 동물",
    items: [
      { e: "🐶", k: "강아지 dog puppy" }, { e: "🐱", k: "고양이 cat" }, { e: "🐭", k: "쥐 mouse" },
      { e: "🐹", k: "햄스터 hamster" }, { e: "🐰", k: "토끼 rabbit" }, { e: "🦊", k: "여우 fox" },
      { e: "🐻", k: "곰 bear" }, { e: "🐼", k: "판다 panda" }, { e: "🐨", k: "코알라 koala" },
      { e: "🐯", k: "호랑이 tiger" }, { e: "🦁", k: "사자 lion" }, { e: "🐮", k: "소 cow" },
      { e: "🐷", k: "돼지 pig" }, { e: "🐸", k: "개구리 frog" }, { e: "🐵", k: "원숭이 monkey" },
      { e: "🦄", k: "유니콘 unicorn" }, { e: "🐔", k: "닭 chicken" }, { e: "🐧", k: "펭귄 penguin" },
      { e: "🐦", k: "새 bird" }, { e: "🦅", k: "독수리 eagle" }, { e: "🦆", k: "오리 duck" },
      { e: "🦉", k: "올빼미 owl 지혜" }, { e: "🦋", k: "나비 butterfly" }, { e: "🐛", k: "애벌레 caterpillar" },
      { e: "🐝", k: "꿀벌 bee honey" }, { e: "🐠", k: "물고기 fish tropical" }, { e: "🐬", k: "돌고래 dolphin" },
      { e: "🐳", k: "고래 whale" }, { e: "🦈", k: "상어 shark" }, { e: "🐙", k: "문어 octopus" },
      { e: "🦒", k: "기린 giraffe" }, { e: "🐘", k: "코끼리 elephant" }, { e: "🦓", k: "얼룩말 zebra" },
    ],
  },
  {
    category: "🍎 음식 · 음료",
    items: [
      { e: "🍎", k: "사과 apple 빨강" }, { e: "🍊", k: "귤 오렌지 orange" }, { e: "🍋", k: "레몬 lemon 노랑" },
      { e: "🍇", k: "포도 grape" }, { e: "🍓", k: "딸기 strawberry" }, { e: "🍒", k: "체리 cherry" },
      { e: "🍑", k: "복숭아 peach" }, { e: "🥝", k: "키위 kiwi" }, { e: "🍍", k: "파인애플 pineapple" },
      { e: "🥭", k: "망고 mango" }, { e: "🍌", k: "바나나 banana" }, { e: "🍉", k: "수박 watermelon" },
      { e: "🍕", k: "피자 pizza" }, { e: "🍔", k: "햄버거 burger" }, { e: "🍟", k: "감자튀김 fries" },
      { e: "🌮", k: "타코 taco" }, { e: "🍜", k: "라면 국수 noodle" }, { e: "🍱", k: "도시락 bento" },
      { e: "🍣", k: "초밥 sushi" }, { e: "🍦", k: "아이스크림 soft ice cream" }, { e: "🎂", k: "케이크 birthday" },
      { e: "🍰", k: "케이크 조각 cake" }, { e: "🍩", k: "도넛 donut" }, { e: "🍪", k: "쿠키 cookie" },
      { e: "☕", k: "커피 coffee" }, { e: "🧋", k: "버블티 boba tea" }, { e: "🥤", k: "음료 drink cup" },
      { e: "🍵", k: "차 tea 녹차" }, { e: "🧃", k: "주스 juice" }, { e: "🥛", k: "우유 milk" },
    ],
  },
  {
    category: "🌱 자연 · 식물",
    items: [
      { e: "🌱", k: "새싹 seedling 성장" }, { e: "🌿", k: "풀 herb 자연" }, { e: "🍀", k: "클로버 네잎 행운" },
      { e: "🌸", k: "벚꽃 봄 cherry blossom" }, { e: "🌺", k: "꽃 hibiscus" }, { e: "🌻", k: "해바라기 sunflower" },
      { e: "🌼", k: "꽃 blossom daisy" }, { e: "🌹", k: "장미 rose 빨강" }, { e: "🌷", k: "튤립 tulip" },
      { e: "💐", k: "꽃다발 bouquet" }, { e: "🍃", k: "잎 leaves 바람" }, { e: "🍂", k: "단풍 fall autumn" },
      { e: "🍁", k: "단풍잎 maple leaf" }, { e: "🌳", k: "나무 deciduous tree" }, { e: "🌲", k: "소나무 evergreen" },
      { e: "🌵", k: "선인장 cactus" }, { e: "🎋", k: "대나무 bamboo" }, { e: "🎍", k: "소나무 장식 pine" },
      { e: "🍄", k: "버섯 mushroom" }, { e: "🌾", k: "밀 벼 wheat sheaf" }, { e: "🌊", k: "파도 wave 바다" },
      { e: "🌍", k: "지구 earth globe" }, { e: "🌏", k: "지구 아시아 asia globe" }, { e: "🌙", k: "달 moon 밤" },
      { e: "⭐", k: "별 star" }, { e: "🌟", k: "빛나는 별 glowing star" }, { e: "☀️", k: "태양 sun" },
      { e: "🌈", k: "무지개 rainbow" }, { e: "⛅", k: "구름 cloud partly" }, { e: "🌤️", k: "맑음 sunny" },
      { e: "🌧️", k: "비 rain" }, { e: "❄️", k: "눈 snow snowflake" }, { e: "🌪️", k: "토네이도 tornado" },
    ],
  },
  {
    category: "✈️ 여행 · 장소",
    items: [
      { e: "🏠", k: "집 home house" }, { e: "🏡", k: "집 house garden" }, { e: "🏫", k: "학교 school" },
      { e: "🏢", k: "빌딩 office building" }, { e: "🏥", k: "병원 hospital" }, { e: "🏦", k: "은행 bank" },
      { e: "🏪", k: "편의점 convenience store" }, { e: "🏨", k: "호텔 hotel" }, { e: "⛪", k: "교회 church" },
      { e: "🗼", k: "에펠탑 tower paris" }, { e: "🗽", k: "자유의여신상 statue liberty" }, { e: "🏰", k: "성 castle" },
      { e: "🌆", k: "도시 city cityscape" }, { e: "🌃", k: "야경 night city" }, { e: "🏖️", k: "해변 beach" },
      { e: "🏔️", k: "산 mountain snow" }, { e: "🌋", k: "화산 volcano" }, { e: "🏕️", k: "캠핑 camping tent" },
      { e: "✈️", k: "비행기 airplane travel" }, { e: "🚀", k: "로켓 rocket space" }, { e: "🛸", k: "UFO 우주선 spaceship" },
      { e: "🚂", k: "기차 train" }, { e: "🚗", k: "자동차 car" }, { e: "🚌", k: "버스 bus" },
      { e: "🛵", k: "스쿠터 scooter" }, { e: "🚲", k: "자전거 bike bicycle" }, { e: "⛵", k: "배 sailing boat" },
      { e: "🚢", k: "여객선 ship cruise" }, { e: "🚁", k: "헬기 helicopter" }, { e: "🛺", k: "삼륜차 auto rickshaw" },
    ],
  },
  {
    category: "💼 업무 · 사무",
    items: [
      { e: "📌", k: "압정 pin 고정" }, { e: "📍", k: "위치 pin location" }, { e: "📎", k: "클립 paperclip" },
      { e: "🖇️", k: "클립 두개 linked paperclips" }, { e: "📋", k: "클립보드 clipboard" }, { e: "📁", k: "폴더 folder" },
      { e: "📂", k: "열린폴더 open folder" }, { e: "🗂️", k: "파일 카드 card index" }, { e: "📊", k: "막대그래프 bar chart" },
      { e: "📈", k: "상승 그래프 chart increasing" }, { e: "📉", k: "하락 그래프 chart decreasing" }, { e: "📝", k: "메모 memo 필기" },
      { e: "✏️", k: "연필 pencil" }, { e: "🖊️", k: "펜 pen" }, { e: "🖋️", k: "만년필 fountain pen" },
      { e: "🖍️", k: "크레용 crayon" }, { e: "📌", k: "압정 pushpin" }, { e: "📏", k: "자 ruler" },
      { e: "📐", k: "삼각자 triangular ruler" }, { e: "✂️", k: "가위 scissors" }, { e: "🗃️", k: "파일함 card file box" },
      { e: "🗄️", k: "서류함 file cabinet" }, { e: "🗑️", k: "휴지통 wastebasket" }, { e: "🔒", k: "잠금 locked" },
      { e: "🔓", k: "열림 unlocked" }, { e: "🔑", k: "열쇠 key" }, { e: "🗝️", k: "옛날열쇠 old key" },
      { e: "💼", k: "서류가방 briefcase" }, { e: "🎒", k: "배낭 backpack school" }, { e: "👜", k: "핸드백 handbag" },
    ],
  },
  {
    category: "📚 교육 · 학습",
    items: [
      { e: "📚", k: "책 books 공부" }, { e: "📖", k: "열린책 open book" }, { e: "📗", k: "녹색책 green book" },
      { e: "📘", k: "파란책 blue book" }, { e: "📙", k: "주황책 orange book" }, { e: "📓", k: "노트 notebook" },
      { e: "📔", k: "장식노트 notebook cover" }, { e: "📒", k: "노란노트 ledger" }, { e: "🎓", k: "졸업 graduation" },
      { e: "🏫", k: "학교 school" }, { e: "🔬", k: "현미경 microscope 과학" }, { e: "🔭", k: "망원경 telescope 천문" },
      { e: "🧪", k: "시험관 test tube 실험" }, { e: "🧫", k: "배양접시 petri dish" }, { e: "🧬", k: "DNA 유전 biology" },
      { e: "⚗️", k: "플라스크 alembic 화학" }, { e: "🧮", k: "주판 abacus 수학" }, { e: "💡", k: "아이디어 전구 lightbulb" },
      { e: "🔍", k: "검색 돋보기 magnify" }, { e: "📡", k: "위성 satellite 통신" }, { e: "🧲", k: "자석 magnet" },
      { e: "⚡", k: "번개 전기 lightning" }, { e: "🔋", k: "배터리 battery" }, { e: "💊", k: "알약 pill medicine" },
      { e: "🩺", k: "청진기 stethoscope doctor" }, { e: "🧩", k: "퍼즐 puzzle" }, { e: "♟️", k: "체스 chess 전략" },
      { e: "🎯", k: "다트 목표 target" }, { e: "🏆", k: "트로피 trophy 우승" }, { e: "🥇", k: "금메달 1등 gold" },
    ],
  },
  {
    category: "💻 기술 · 컴퓨터",
    items: [
      { e: "💻", k: "노트북 laptop computer" }, { e: "🖥️", k: "데스크탑 desktop monitor" }, { e: "📱", k: "스마트폰 phone mobile" },
      { e: "⌨️", k: "키보드 keyboard" }, { e: "🖱️", k: "마우스 mouse" }, { e: "🖨️", k: "프린터 printer" },
      { e: "📷", k: "카메라 camera" }, { e: "📸", k: "셀카 selfie camera flash" }, { e: "📹", k: "비디오 video camera" },
      { e: "🎥", k: "영화 movie camera" }, { e: "📺", k: "TV 텔레비전 television" }, { e: "📻", k: "라디오 radio" },
      { e: "🎙️", k: "마이크 microphone" }, { e: "🎚️", k: "레벨 level slider" }, { e: "🎛️", k: "컨트롤 control knobs" },
      { e: "🤖", k: "로봇 AI 인공지능 robot" }, { e: "⚙️", k: "설정 기어 gear" }, { e: "🔧", k: "렌치 wrench 수리" },
      { e: "🔩", k: "볼트 nut bolt" }, { e: "🛠️", k: "도구 tools 개발" }, { e: "💾", k: "플로피 저장 floppy disk" },
      { e: "💿", k: "CD 디스크 disc" }, { e: "📀", k: "DVD 디스크" }, { e: "🖲️", k: "트랙볼 trackball" },
      { e: "💡", k: "전구 lightbulb 아이디어" }, { e: "🔌", k: "플러그 electric plug" }, { e: "🔋", k: "배터리 battery" },
      { e: "📡", k: "안테나 satellite dish" }, { e: "🛰️", k: "인공위성 satellite" }, { e: "🚀", k: "로켓 rocket launch" },
    ],
  },
  {
    category: "🎵 예술 · 음악",
    items: [
      { e: "🎵", k: "음표 musical note" }, { e: "🎶", k: "음악 musical notes" }, { e: "🎼", k: "악보 musical score" },
      { e: "🎹", k: "피아노 piano keyboard" }, { e: "🎸", k: "기타 guitar" }, { e: "🎺", k: "트럼펫 trumpet" },
      { e: "🎻", k: "바이올린 violin" }, { e: "🥁", k: "드럼 drum" }, { e: "🎷", k: "색소폰 saxophone" },
      { e: "🪗", k: "아코디언 accordion" }, { e: "🎤", k: "마이크 microphone 노래" }, { e: "🎧", k: "헤드폰 headphone" },
      { e: "🎨", k: "그림 예술 art palette" }, { e: "🖌️", k: "붓 paintbrush" }, { e: "✏️", k: "연필 pencil" },
      { e: "🎭", k: "연극 theater masks" }, { e: "🎬", k: "영화 clapper board" }, { e: "🎞️", k: "필름 film" },
      { e: "📸", k: "사진 photo selfie" }, { e: "🎤", k: "가수 singer microphone" }, { e: "💃", k: "춤 dance woman" },
      { e: "🕺", k: "춤 dance man" }, { e: "🎭", k: "공연 performance" }, { e: "🎪", k: "서커스 circus" },
    ],
  },
  {
    category: "⚽ 스포츠 · 게임",
    items: [
      { e: "⚽", k: "축구 soccer football" }, { e: "🏀", k: "농구 basketball" }, { e: "🏈", k: "미식축구 american football" },
      { e: "⚾", k: "야구 baseball" }, { e: "🥎", k: "소프트볼 softball" }, { e: "🏐", k: "배구 volleyball" },
      { e: "🏉", k: "럭비 rugby" }, { e: "🎾", k: "테니스 tennis" }, { e: "🏸", k: "배드민턴 badminton" },
      { e: "🏒", k: "아이스하키 hockey" }, { e: "🥊", k: "권투 boxing glove" }, { e: "🥋", k: "태권도 martial arts" },
      { e: "⛳", k: "골프 golf" }, { e: "🏹", k: "양궁 archery bow" }, { e: "🎣", k: "낚시 fishing" },
      { e: "🏊", k: "수영 swimming" }, { e: "🚴", k: "자전거 cycling" }, { e: "🏋️", k: "역기 weightlifting" },
      { e: "🤸", k: "체조 gymnastics" }, { e: "🧗", k: "클라이밍 climbing" }, { e: "🤺", k: "펜싱 fencing" },
      { e: "🏆", k: "우승 trophy champion" }, { e: "🥇", k: "금메달 gold medal" }, { e: "🎯", k: "다트 target" },
      { e: "🎮", k: "게임기 video game" }, { e: "🕹️", k: "조이스틱 joystick" }, { e: "🎲", k: "주사위 dice game" },
      { e: "♟️", k: "체스 chess" }, { e: "🧩", k: "퍼즐 puzzle" }, { e: "🃏", k: "트럼프 joker card" },
    ],
  },
  {
    category: "❤️ 기호 · 하트",
    items: [
      { e: "❤️", k: "빨간 하트 red heart love" }, { e: "🧡", k: "주황 하트 orange heart" }, { e: "💛", k: "노랑 하트 yellow" },
      { e: "💚", k: "초록 하트 green" }, { e: "💙", k: "파랑 하트 blue" }, { e: "💜", k: "보라 하트 purple" },
      { e: "🖤", k: "검정 하트 black" }, { e: "🤍", k: "흰 하트 white" }, { e: "🤎", k: "갈색 하트 brown" },
      { e: "💕", k: "두 하트 two hearts" }, { e: "💞", k: "회전 하트 revolving" }, { e: "💓", k: "두근 하트 beating" },
      { e: "💗", k: "핑크 성장 growing heart" }, { e: "💖", k: "반짝 하트 sparkling" }, { e: "💘", k: "화살 하트 cupid" },
      { e: "💝", k: "리본 하트 ribbon" }, { e: "💟", k: "장식 하트 decoration" }, { e: "☮️", k: "평화 peace" },
      { e: "✨", k: "반짝 sparkles" }, { e: "💫", k: "회오리 별 dizzy" }, { e: "⭐", k: "별 star" },
      { e: "🌟", k: "빛나는 별 glowing star" }, { e: "🔥", k: "불꽃 fire hot" }, { e: "💥", k: "폭발 collision" },
      { e: "🎉", k: "파티 party popper" }, { e: "🎊", k: "색종이 confetti" }, { e: "🎈", k: "풍선 balloon" },
      { e: "🎁", k: "선물 gift present" }, { e: "🎀", k: "리본 ribbon bow" }, { e: "🏅", k: "메달 medal" },
    ],
  },
  {
    category: "🔢 숫자 · 기호",
    items: [
      { e: "1️⃣", k: "숫자 1 one" }, { e: "2️⃣", k: "숫자 2 two" }, { e: "3️⃣", k: "숫자 3 three" },
      { e: "4️⃣", k: "숫자 4 four" }, { e: "5️⃣", k: "숫자 5 five" }, { e: "6️⃣", k: "숫자 6 six" },
      { e: "7️⃣", k: "숫자 7 seven" }, { e: "8️⃣", k: "숫자 8 eight" }, { e: "9️⃣", k: "숫자 9 nine" },
      { e: "🔟", k: "숫자 10 ten" }, { e: "💯", k: "100점 perfect hundred" }, { e: "🆕", k: "new 신규 새로운" },
      { e: "🆙", k: "up 업 상승" }, { e: "🆒", k: "cool 쿨" }, { e: "🆓", k: "free 무료" },
      { e: "🅰️", k: "A 혈액형" }, { e: "🅱️", k: "B 혈액형" }, { e: "🆎", k: "AB 혈액형" },
      { e: "✅", k: "체크 완료 check done" }, { e: "❎", k: "X 취소 cross" }, { e: "⭕", k: "O 원 circle" },
      { e: "❌", k: "X 오류 error cross" }, { e: "❓", k: "물음표 question" }, { e: "❗", k: "느낌표 exclamation" },
      { e: "💲", k: "달러 dollar money" }, { e: "💱", k: "환전 currency exchange" }, { e: "🔰", k: "초보 beginner" },
      { e: "♻️", k: "재활용 recycle" }, { e: "🚩", k: "깃발 flag red" }, { e: "🏳️", k: "흰깃발 white flag" },
    ],
  },
];

export function EmojiPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (emoji: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClick);
      setTimeout(() => searchRef.current?.focus(), 50);
    }
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const filtered = query.trim()
    ? EMOJI_DATA.flatMap((cat) =>
        cat.items.filter((item) =>
          item.k.toLowerCase().includes(query.toLowerCase()) || item.e === query
        )
      )
    : null;

  function pick(emoji: string) {
    onChange(emoji);
    setOpen(false);
    setQuery("");
  }

  const btnCls = (active: boolean) =>
    `w-9 h-9 text-xl border-none cursor-pointer rounded flex items-center justify-center transition-colors duration-100 shrink-0 hover:bg-p-bg ${active ? "bg-p-bg" : "bg-transparent"}`;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-16 h-11 text-[26px] border border-black/10 rounded bg-white cursor-pointer flex items-center justify-center shrink-0 leading-none"
        title="이모지 선택"
      >
        {value || "📌"}
      </button>

      {open && (
        <div
          className="absolute top-[calc(100%+6px)] left-0 z-[500] w-[340px] max-h-[400px] bg-white border border-black/10 rounded-lg flex flex-col overflow-hidden"
          style={{ boxShadow: "rgba(0,0,0,0.04) 0px 4px 18px, rgba(0,0,0,0.03) 0px 2px 8px" }}
        >
          <div className="px-2.5 py-2 border-b border-black/[0.07] shrink-0">
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="검색: 책, 별, 로켓, 과학, 축구…"
              className="w-full box-border border border-black/10 rounded px-2.5 py-1.5 text-[13px] outline-none font-[inherit]"
            />
          </div>

          <div className="overflow-y-auto flex-1 px-2 py-1.5 pb-2.5">
            {filtered ? (
              filtered.length > 0 ? (
                <div className="flex flex-wrap gap-0.5">
                  {filtered.map((item) => (
                    <button key={item.e} type="button" onClick={() => pick(item.e)}
                      title={item.k.split(" ")[0]}
                      className={btnCls(false)}
                    >{item.e}</button>
                  ))}
                </div>
              ) : (
                <p className="text-center text-p-muted text-[13px] my-4">결과 없음</p>
              )
            ) : (
              EMOJI_DATA.map((cat) => (
                <div key={cat.category} className="mb-2">
                  <p className="m-0 mx-0.5 mt-1.5 mb-1 text-[10px] font-semibold text-p-muted" style={{ letterSpacing: "0.05em" }}>
                    {cat.category}
                  </p>
                  <div className="flex flex-wrap gap-0.5">
                    {cat.items.map((item) => (
                      <button key={item.e} type="button" onClick={() => pick(item.e)}
                        title={item.k.split(" ")[0]}
                        className={btnCls(item.e === value)}
                      >{item.e}</button>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
