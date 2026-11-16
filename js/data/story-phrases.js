// Spoken lines owned by the Storybook. Root merges this mapping into the audio phrase
// catalogue and voice build. Every line is brief enough to finish before a preschooler
// reaches for the next large picture.

const P = (text, note) => Object.freeze({ text, speaker: "guide", note });
const phrases = {};
const add = (key, text, note) => { phrases[key] = P(text, note); };

add("story_ui_choose", "Choose a story picture.", "Storybook library invitation");
add("story_ui_next", "Turn the page.", "A chosen picture has reacted; child may advance");
add("story_ui_saved", "Your story is safe in your storybook.", "A local keepsake card was saved");
add("story_ui_book", "Here are your story cards.", "Open locally saved Storybook cards");
add("story_ui_empty_book", "Your first story card is waiting to be made.", "Empty local Storybook");
add("story_ui_replay", "Want to tell it a different way?", "Replay invitation without pressure");

// Rayna and words that begin with the same sound.
add("story_rayna_intro", "Listen: Rayna. Rabbit. Rainbow. Those words start with the same sound.", "Own-name and initial-sound story intro");
add("story_rayna_b1_prompt", "Who should join Rayna first?", "Choose rabbit or rainbow; neither is a quiz answer");
add("story_rayna_b1_rabbit", "Rabbit lifts its ears. Rayna and Rabbit start with the same sound.", "Rabbit choice consequence");
add("story_rayna_b1_rainbow", "Rainbow glows. Rayna and Rainbow start with the same sound.", "Rainbow choice consequence");
add("story_rayna_b2_prompt", "What comes into the story next?", "Prompt permits Raindrop or Ribbon without claiming Ribbon rolls.");
add("story_rayna_b2_rabbit_prompt", "Rabbit hops beside Rayna. Should they find a raindrop or a ribbon?", "Rabbit branch second beat");
add("story_rayna_b2_rainbow_prompt", "Rainbow bends over Rayna. Should a raindrop or a ribbon appear?", "Rainbow branch second beat");
add("story_rayna_b2_raindrop", "A raindrop drops beside them, then rolls to Rayna.", "Raindrop stops at Rayna and does not lead the group to beat three.");
add("story_rayna_b2_ribbon", "Rayna holds the ribbon. It waves beside her.", "Flat Ribbon stays in near-contact with Rayna's free hand and never wraps.");
add("story_rayna_b3_prompt", "Where should the story rest?", "Fallback final beat");
add("story_rayna_b3_rabbit_prompt", "Rabbit is ready to rest. Where should everyone go?", "Rabbit branch final beat");
add("story_rayna_b3_rainbow_prompt", "Rayna and Rainbow are ready to rest. Tree or house?", "The group moves to an exterior resting place.");
add("story_rayna_b3_tree", "Everyone rests under the tree while the leaves rustle softly.", "Tree frames the complete group.");
add("story_rayna_b3_house", "Everyone stops beside the warm, dry house.", "Closed House remains an exterior destination.");
add("story_rayna_end_rabbit", "Rayna and Rabbit made a rainy adventure together.", "Rabbit-path completion");
add("story_rayna_end_rainbow", "Rayna and Rainbow made a colorful adventure together.", "Rainbow-path completion");

// Pip and B alliteration.
add("story_pip_b_intro", "Listen: ball. Bee. Those words start alike. Something is bobbing closer.", "Initial B and alliteration intro");
add("story_pip_b_b1_prompt", "What bouncy friend should Pip follow?", "Choose ball or bee");
add("story_pip_b_b1_ball", "The ball bounces. Ball and bee start with the same sound.", "Ball choice consequence");
add("story_pip_b_b1_bee", "The bee buzzes. Bee and ball start with the same sound.", "Bee choice consequence");
add("story_pip_b_b2_prompt", "What should carry the adventure?", "Fallback second beat");
add("story_pip_b_b2_ball_prompt", "The ball bounces away. Should Pip bring a basket or a boat?", "Ball branch second beat");
add("story_pip_b_b2_bee_prompt", "The bee buzzes ahead. Should Pip bring a basket or a boat?", "Bee branch second beat");
add("story_pip_b_b2_basket", "The basket waits beside Pip.", "Truthful fallback; exact passenger reaction overrides it on authored paths.");
add("story_pip_b_b2_boat", "The boat waits beside Pip.", "Truthful dry-stage fallback; exact passenger reaction overrides it.");
add("story_pip_b_b3_prompt", "What should join them at the end?", "Works for arriving Butterfly and placed Blanket.");
add("story_pip_b_b3_butterfly", "Butterfly flutters down and lands beside Pip.", "Butterfly reaches a stable landing beside the group.");
add("story_pip_b_b3_blanket", "The folded blanket rests beside Pip and makes the spot cozy.", "Approved folded Blanket is placed nearby, never spread or tucked.");
add("story_pip_b_end_ball", "Pip's ball bounced through a bright, busy story.", "Ball-path completion");
add("story_pip_b_end_bee", "Pip's bee buzzed through a bright, busy story.", "Bee-path completion");

// Cat, hat, moon and spoon rhyme play.
add("story_cat_intro", "Cat is having a picnic and listening for playful sounds.", "Full-body black Cat sits beside the picnic basket.");
add("story_cat_b1_prompt", "Should Cat wear a hat, or invite Fish?", "Hat rests on Cat; Fish arrives beside Cat.");
add("story_cat_b1_hat", "Cat wears the hat. Cat and hat sound alike at the end.", "Hat rests on the full-body Cat sprite’s crown.");
add("story_cat_b1_fish", "Fish arrives beside Cat with a swish. Cat and fish have different ending sounds.", "Fish moves beside Cat without requiring water.");
add("story_cat_b2_prompt", "What comes to the picnic next?", "Fallback second beat");
add("story_cat_b2_hat_prompt", "Cat wears the hat. Moon or spoon? They sound alike at the end.", "No new looking-up pose is required.");
add("story_cat_b2_fish_prompt", "Fish waits beside Cat. Moon or spoon? They sound alike at the end.", "Fish remains at the picnic without an unseen wish action.");
add("story_cat_b2_moon", "The moon rises over the picnic with a silver glow.", "Moon consequence");
add("story_cat_b2_spoon", "The spoon taps the basket: ting, ting, ting.", "Spoon consequence");
add("story_cat_b3_prompt", "What little picture finishes the picnic?", "Star or Heart appears as a visible picture choice.");
add("story_cat_b3_star", "A star twinkles above Cat's picnic.", "Star consequence");
add("story_cat_b3_heart", "A heart glows beside Cat's picnic.", "Heart is placed and glows; Cat does not hold or pass it.");
add("story_cat_end_hat", "Cat wore a hat through a playful picnic tale.", "Hat-path completion");
add("story_cat_end_fish", "Cat and Fish made a splashy picnic tale.", "Fish-path completion");

// Moon tune rhyme story.
add("story_moon_intro", "The moon hums a tune and waits for a rhyming friend.", "Rhyme story intro");
add("story_moon_b1_prompt", "Who joins the moon tune: spoon or balloon?", "Both choices rhyme");
add("story_moon_b1_spoon", "Moon and spoon sound alike at the end. The spoon keeps the beat.", "Spoon rhyme consequence");
add("story_moon_b1_balloon", "Moon and balloon sound alike at the end. The balloon bobs to the tune.", "Balloon rhyme consequence");
add("story_moon_b2_prompt", "Where should the moon tune travel?", "Fallback second beat");
add("story_moon_b2_spoon_prompt", "The spoon is keeping time. Should the tune visit the tree or the house?", "Spoon branch");
add("story_moon_b2_balloon_prompt", "The balloon floats with the tune. Should it pass the tree or the house?", "Balloon branch");
add("story_moon_b2_tree", "The tree shakes its leaves like tiny bells.", "Tree consequence");
add("story_moon_b2_house", "The house windows glow while everyone listens.", "House consequence");
add("story_moon_b3_prompt", "What should shine on the last note?", "Final beat");
add("story_moon_b3_star", "A star pops into the sky with the last chime.", "Existing chime cue and Star appearance begin together.");
add("story_moon_b3_rainbow", "A rainbow curls across the sky with the last chime.", "Existing chime cue and Rainbow appearance begin together.");
add("story_moon_end_spoon", "Moon and Spoon played a gentle tune all through the valley.", "Spoon-path completion");
add("story_moon_end_balloon", "Moon and Balloon floated through a humming, rhyming tune.", "Balloon-path completion");

// Cozy hard-C alliteration.
add("story_cozy_intro", "Listen: cozy. Cat. Caterpillar. Those words start alike.", "Initial hard C and alliteration intro");
add("story_cozy_b1_prompt", "Who follows the cozy sound?", "Choose cat or caterpillar");
add("story_cozy_b1_cat", "Cat comes close. Cat and cozy start with the same sound.", "Cat consequence");
add("story_cozy_b1_caterpillar", "Caterpillar comes close. Caterpillar and cozy start with the same sound.", "Caterpillar consequence");
add("story_cozy_b2_prompt", "What should come close next?", "Chosen object is placed beside the lead rather than carried.");
add("story_cozy_b2_cat_prompt", "Which should sit beside Cat: the branch with a cocoon or the card with Rayna's name?", "Names the complete Cocoon asset and the visible card with Rayna's name.");
add("story_cozy_b2_caterpillar_prompt", "Which should sit beside Caterpillar: the branch with a cocoon or the card with Rayna's name?", "Names the complete Cocoon asset and the visible card with Rayna's name.");
add("story_cozy_b2_cocoon", "The branch with the cocoon rests close by.", "Complete branch-and-cocoon art stays intact.");
add("story_cozy_b2_card", "The card with Rayna's name rests close by.", "Narration matches the visible RAYNA card.");
add("story_cozy_b3_prompt", "Where is the coziest corner?", "Final beat");
add("story_cozy_b3_tree", "They rest together under the tree.", "No unsupported carrying or full-body curl is required.");
add("story_cozy_b3_house", "They rest together beside the house.", "Closed House remains an exterior setting.");
add("story_cozy_end_cat", "Cat carried the cozy story all the way home.", "Cat-path completion");
add("story_cozy_end_caterpillar", "Caterpillar carried the cozy story all the way home.", "Caterpillar-path completion");

// Functional print and own-name story.
add("story_mail_intro", "Veer has a picture message for Rayna. A mark can tell where it belongs.", "Functional print and name intro");
add("story_mail_b1_prompt", "What should help the message find Rayna?", "Choose name card or mailbox");
add("story_mail_b1_name", "Rayna's name on the card tells whose message it is.", "Name print has a real purpose");
add("story_mail_b1_mailbox", "The mailbox can hold the picture until Rayna takes it.", "Mailbox receives the selected picture before Rayna retrieves it.");
add("story_mail_b2_prompt", "What should guide the message next?", "Fallback second beat");
add("story_mail_b2_name_prompt", "The name says who. Should an arrow or a house show where?", "Name branch functional print");
add("story_mail_b2_mailbox_prompt", "The mailbox is ready. Should an arrow or a house show the way?", "Mailbox branch functional print");
add("story_mail_b2_arrow", "The arrow points Veer along the path.", "Veer turns and follows Arrow before the final picture is selected.");
add("story_mail_b2_house", "The house picture shows exactly where the message is going.", "House symbol consequence");
add("story_mail_b3_prompt", "Which picture should Veer bring to Rayna?", "Works for labeled handoff and mailbox retrieval paths.");
add("story_mail_b3_heart", "Veer brings the heart picture to Rayna.", "Truthful fallback; marker-specific reaction supplies the complete action.");
add("story_mail_b3_flower", "Veer brings the flower picture to Rayna.", "Truthful fallback; marker-specific reaction supplies the complete action.");
add("story_mail_end_name", "The name card, path picture, and kind message all carried meaning to Rayna.", "Name-path completion");
add("story_mail_end_mailbox", "The mailbox, path picture, and kind message all helped the story arrive.", "Mailbox-path completion");

// Signs carry meaning without a reading gate.
add("story_signs_intro", "Two picture signs are waiting on the valley path.", "Functional-print story intro");
add("story_signs_b1_prompt", "Which sign should Veer notice first?", "Choose stop or arrow sign");
add("story_signs_b1_stop", "Veer stops at the stop sign and looks around.", "Veer visibly pauses before continuing.");
add("story_signs_b1_arrow", "Veer turns where the arrow points.", "Veer visibly changes direction before continuing.");
add("story_signs_b2_prompt", "Where does the path lead?", "Fallback second beat");
add("story_signs_b2_stop_prompt", "After a careful pause, should Veer visit the bridge or the house?", "Stop branch");
add("story_signs_b2_arrow_prompt", "The arrow points ahead. Should Veer follow it to the bridge or the house?", "Arrow branch");
add("story_signs_b2_bridge", "The path reaches the bright rainbow bridge.", "Bridge consequence");
add("story_signs_b2_house", "The path reaches the warm little house.", "House consequence");
add("story_signs_b3_prompt", "Who should Veer meet there?", "Final story choice");
add("story_signs_b3_pip", "Pip flutters over to meet Veer.", "Pip arrives at Veer's reached side with no extra sign.");
add("story_signs_b3_unicorn", "Unicorn comes over to meet Veer.", "Unicorn arrives at Veer's reached side with no extra sign.");
add("story_signs_end_stop", "A stop sign helped the travelers pause, notice, and choose their way.", "Stop-path completion");
add("story_signs_end_arrow", "An arrow sign helped the travelers find their way through the valley.", "Arrow-path completion");

// Open narrative meaning and sequence.
add("story_star_intro", "Ba found a little star that tumbled out of the sky.", "Open three-beat narrative intro");
add("story_star_b1_prompt", "Who should help the star?", "Choose protagonist");
add("story_star_b1_pip", "Pip flutters close and promises to help the star.", "Pip protagonist consequence");
add("story_star_b1_veer", "Veer gently picks up the star and promises to help.", "Veer protagonist consequence");
add("story_star_b2_prompt", "Where should the search begin?", "Fallback second beat");
add("story_star_b2_pip_prompt", "Pip looks for the star's way home. Search by the tree or the house?", "Pip branch place choice");
add("story_star_b2_veer_prompt", "Veer looks for the star's way home. Search by the tree or the house?", "Veer branch place choice");
add("story_star_b2_tree", "The tree lifts its tallest branch toward the sky.", "Tree consequence");
add("story_star_b2_house", "The house turns on every light to make a glowing path.", "House consequence");
add("story_star_b3_prompt", "What should send the star home?", "Final cause and effect choice");
add("story_star_b3_pip_tree_prompt", "Pip finds the tree's highest branch. Will a heart light or a balloon lift the star?", "Pip and tree cause-and-effect ending choice");
add("story_star_b3_pip_house_prompt", "Pip finds the bright house. Will a heart light or a balloon lift the star?", "Pip and house cause-and-effect ending choice");
add("story_star_b3_veer_tree_prompt", "Veer finds the tree's highest branch. Will a heart light or a balloon lift the star?", "Veer and tree cause-and-effect ending choice");
add("story_star_b3_veer_house_prompt", "Veer finds the bright house. Will a heart light or a balloon lift the star?", "Veer and house cause-and-effect ending choice");
add("story_star_b3_heart", "A warm heart wish lifts the star higher and higher.", "Heart consequence");
add("story_star_b3_balloon", "A balloon carries the star gently up through the clouds.", "Balloon consequence");
add("story_star_end_pip", "Pip helped the little star find the sky, and Ba saved the tale.", "Pip-path completion");
add("story_star_end_veer", "Veer helped the little star find the sky, and Ba saved the tale.", "Veer-path completion");
add("story_star_end_pip_tree_heart", "Pip followed the tree's tallest branch. A warm heart light lifted the little star home.", "Complete Pip, tree, heart path");
add("story_star_end_pip_tree_balloon", "Pip followed the tree's tallest branch. The balloon carried the little star home.", "Complete Pip, tree, balloon path");
add("story_star_end_pip_house_heart", "At the bright house, Pip held a warm heart light. It lifted the little star home.", "Complete Pip, house, heart path");
add("story_star_end_pip_house_balloon", "At the bright house, Pip found a balloon. It carried the little star home.", "Complete Pip, house, balloon path");
add("story_star_end_veer_tree_heart", "Veer followed the tree's tallest branch. A warm heart light lifted the little star home.", "Complete Veer, tree, heart path");
add("story_star_end_veer_tree_balloon", "Veer followed the tree's tallest branch. The balloon carried the little star home.", "Complete Veer, tree, balloon path");
add("story_star_end_veer_house_heart", "At the bright house, Veer held a warm heart light. It lifted the little star home.", "Complete Veer, house, heart path");
add("story_star_end_veer_house_balloon", "At the bright house, Veer found a balloon. It carried the little star home.", "Complete Veer, house, balloon path");


// Reviewed reference story actions and complete paths.
add("story_mail_b3_name_heart", "Veer brings the heart with Rayna's name card. Rayna receives them.", "Heart and Name Card stay paired to Rayna's free hand.");
add("story_mail_b3_name_flower", "Veer brings the flower with Rayna's name card. Rayna receives them.", "Flower and Name Card stay paired to Rayna's free hand.");
add("story_mail_b3_mailbox_heart", "Veer places the heart at the mailbox opening. Rayna takes it.", "Heart reaches the opening, then Rayna's free hand.");
add("story_mail_b3_mailbox_flower", "Veer places the flower at the mailbox opening. Rayna takes it.", "Flower reaches the opening, then Rayna's free hand.");
add("story_mail_end_name_card_arrow_heart", "Veer followed the arrow with Rayna's name card. Rayna received the heart picture.", "Exact name-mail path: name-card, arrow-sign, heart");
add("story_mail_end_name_card_arrow_flower", "Veer followed the arrow with Rayna's name card. Rayna received the flower picture.", "Exact name-mail path: name-card, arrow-sign, flower");
add("story_mail_end_name_card_house_heart", "Beside the house, Veer brought Rayna's name card and heart picture to Rayna.", "Exact name-mail path: name-card, house, heart");
add("story_mail_end_name_card_house_flower", "Beside the house, Veer brought Rayna's name card and flower picture to Rayna.", "Exact name-mail path: name-card, house, flower");
add("story_mail_end_mailbox_arrow_heart", "Veer followed the arrow to the mailbox. Rayna took the heart picture from it.", "Exact name-mail path: mailbox, arrow-sign, heart");
add("story_mail_end_mailbox_arrow_flower", "Veer followed the arrow to the mailbox. Rayna took the flower picture from it.", "Exact name-mail path: mailbox, arrow-sign, flower");
add("story_mail_end_mailbox_house_heart", "Beside the house, Veer placed the heart at the mailbox. Rayna took it.", "Exact name-mail path: mailbox, house, heart");
add("story_mail_end_mailbox_house_flower", "Beside the house, Veer placed the flower at the mailbox. Rayna took it.", "Exact name-mail path: mailbox, house, flower");
add("story_signs_end_stop_bridge_pip", "Veer paused at the stop sign, crossed the bridge, and met Pip on the other side.", "Exact valley-signs path: stop-sign, bridge, pip");
add("story_signs_end_stop_bridge_unicorn", "Veer paused at the stop sign, crossed the bridge, and met Unicorn on the other side.", "Exact valley-signs path: stop-sign, bridge, unicorn");
add("story_signs_end_stop_house_pip", "Veer paused at the stop sign, walked to the house, and met Pip there.", "Exact valley-signs path: stop-sign, house, pip");
add("story_signs_end_stop_house_unicorn", "Veer paused at the stop sign, walked to the house, and met Unicorn there.", "Exact valley-signs path: stop-sign, house, unicorn");
add("story_signs_end_arrow_bridge_pip", "Veer turned where the arrow pointed, crossed the bridge, and met Pip on the other side.", "Exact valley-signs path: arrow-sign, bridge, pip");
add("story_signs_end_arrow_bridge_unicorn", "Veer turned where the arrow pointed, crossed the bridge, and met Unicorn on the other side.", "Exact valley-signs path: arrow-sign, bridge, unicorn");
add("story_signs_end_arrow_house_pip", "Veer turned where the arrow pointed, followed the path to the house, and met Pip there.", "Exact valley-signs path: arrow-sign, house, pip");
add("story_signs_end_arrow_house_unicorn", "Veer turned where the arrow pointed, followed the path to the house, and met Unicorn there.", "Exact valley-signs path: arrow-sign, house, unicorn");


// Reviewed remaining story actions and complete paths.
add("story_pip_b_b2_ball_basket", "The ball settles into the basket beside Pip.", "Ball sits above the basket rim; Pip remains outside.");
add("story_pip_b_b2_ball_boat", "The ball settles into the boat beside Pip.", "Ball sits above the hull; Pip remains outside.");
add("story_pip_b_b2_bee_basket", "Bee settles into the basket beside Pip.", "Bee remains visible above the basket rim; Pip remains outside.");
add("story_pip_b_b2_bee_boat", "Bee settles into the boat beside Pip.", "Bee remains visible above the hull; Pip remains outside.");
add("story_rayna_end_rabbit_raindrop_tree", "A raindrop rolled to Rayna and Rabbit. They rested under the tree.", "Exact rayna-rainy-r path: rabbit, raindrop, tree");
add("story_rayna_end_rabbit_raindrop_house", "A raindrop rolled to Rayna and Rabbit. They stopped beside the warm, dry house.", "Exact rayna-rainy-r path: rabbit, raindrop, house");
add("story_rayna_end_rabbit_ribbon_tree", "Rayna held the ribbon beside Rabbit. They rested together under the tree.", "Exact rayna-rainy-r path: rabbit, ribbon, tree");
add("story_rayna_end_rabbit_ribbon_house", "Rayna held the ribbon beside Rabbit. They stopped together beside the warm house.", "Exact rayna-rainy-r path: rabbit, ribbon, house");
add("story_rayna_end_rainbow_raindrop_tree", "A raindrop rolled to Rayna beneath the rainbow. Rayna rested under the tree.", "Exact rayna-rainy-r path: rainbow, raindrop, tree");
add("story_rayna_end_rainbow_raindrop_house", "A raindrop rolled to Rayna beneath the rainbow. Rayna stopped beside the warm, dry house.", "Exact rayna-rainy-r path: rainbow, raindrop, house");
add("story_rayna_end_rainbow_ribbon_tree", "Rayna held the waving ribbon beneath the rainbow and rested under the tree.", "Exact rayna-rainy-r path: rainbow, ribbon, tree");
add("story_rayna_end_rainbow_ribbon_house", "Rayna held the waving ribbon beneath the rainbow and stopped beside the warm house.", "Exact rayna-rainy-r path: rainbow, ribbon, house");
add("story_pip_b_end_ball_basket_butterfly", "The ball rested in the basket beside Pip. Butterfly landed next to them.", "Exact pip-bouncy-b path: ball, basket, butterfly");
add("story_pip_b_end_ball_basket_blanket", "The ball rested in the basket beside Pip. The folded blanket rested nearby.", "Exact pip-bouncy-b path: ball, basket, blanket");
add("story_pip_b_end_ball_boat_butterfly", "The ball rested in the boat beside Pip. Butterfly landed next to them.", "Exact pip-bouncy-b path: ball, boat, butterfly");
add("story_pip_b_end_ball_boat_blanket", "The ball rested in the boat beside Pip. The folded blanket rested nearby.", "Exact pip-bouncy-b path: ball, boat, blanket");
add("story_pip_b_end_bee_basket_butterfly", "Bee rested in the basket beside Pip. Butterfly landed next to them.", "Exact pip-bouncy-b path: bee, basket, butterfly");
add("story_pip_b_end_bee_basket_blanket", "Bee rested in the basket beside Pip. The folded blanket rested nearby.", "Exact pip-bouncy-b path: bee, basket, blanket");
add("story_pip_b_end_bee_boat_butterfly", "Bee rested in the boat beside Pip. Butterfly landed next to them.", "Exact pip-bouncy-b path: bee, boat, butterfly");
add("story_pip_b_end_bee_boat_blanket", "Bee rested in the boat beside Pip. The folded blanket rested nearby.", "Exact pip-bouncy-b path: bee, boat, blanket");
add("story_cat_end_hat_moon_star", "Cat wore the hat. Moon rose, and a star twinkled above the picnic.", "Exact cat-hat-picnic path: hat, moon, star");
add("story_cat_end_hat_moon_heart", "Cat wore the hat. Moon rose, and a heart glowed beside the picnic.", "Exact cat-hat-picnic path: hat, moon, heart");
add("story_cat_end_hat_spoon_star", "Cat wore the hat. Spoon tapped the basket, and a star twinkled above the picnic.", "Exact cat-hat-picnic path: hat, spoon, star");
add("story_cat_end_hat_spoon_heart", "Cat wore the hat. Spoon tapped the basket, and a heart glowed beside the picnic.", "Exact cat-hat-picnic path: hat, spoon, heart");
add("story_cat_end_fish_moon_star", "Fish waited beside Cat. Moon rose, and a star twinkled above the picnic.", "Exact cat-hat-picnic path: fish, moon, star");
add("story_cat_end_fish_moon_heart", "Fish waited beside Cat. Moon rose, and a heart glowed beside the picnic.", "Exact cat-hat-picnic path: fish, moon, heart");
add("story_cat_end_fish_spoon_star", "Fish waited beside Cat. Spoon tapped the basket, and a star twinkled above the picnic.", "Exact cat-hat-picnic path: fish, spoon, star");
add("story_cat_end_fish_spoon_heart", "Fish waited beside Cat. Spoon tapped the basket, and a heart glowed beside the picnic.", "Exact cat-hat-picnic path: fish, spoon, heart");
add("story_moon_end_spoon_tree_star", "Moon and Spoon played beside the tree. A star appeared with the last chime.", "Exact moon-tune path: spoon, tree, star");
add("story_moon_end_spoon_tree_rainbow", "Moon and Spoon played beside the tree. A rainbow appeared with the last chime.", "Exact moon-tune path: spoon, tree, rainbow");
add("story_moon_end_spoon_house_star", "Moon and Spoon played beside the glowing house. A star appeared with the last chime.", "Exact moon-tune path: spoon, house, star");
add("story_moon_end_spoon_house_rainbow", "Moon and Spoon played beside the glowing house. A rainbow appeared with the last chime.", "Exact moon-tune path: spoon, house, rainbow");
add("story_moon_end_balloon_tree_star", "Balloon bobbed beside Moon and the tree. A star appeared with the last chime.", "Exact moon-tune path: balloon, tree, star");
add("story_moon_end_balloon_tree_rainbow", "Balloon bobbed beside Moon and the tree. A rainbow appeared with the last chime.", "Exact moon-tune path: balloon, tree, rainbow");
add("story_moon_end_balloon_house_star", "Balloon bobbed beside Moon and the glowing house. A star appeared with the last chime.", "Exact moon-tune path: balloon, house, star");
add("story_moon_end_balloon_house_rainbow", "Balloon bobbed beside Moon and the glowing house. A rainbow appeared with the last chime.", "Exact moon-tune path: balloon, house, rainbow");
add("story_cozy_end_cat_cocoon_tree", "Cat and the cocoon on its branch rested under the tree.", "Exact cozy-c-sounds path: cat, cocoon, tree");
add("story_cozy_end_cat_cocoon_house", "Cat and the cocoon on its branch rested beside the house.", "Exact cozy-c-sounds path: cat, cocoon, house");
add("story_cozy_end_cat_card_tree", "Cat and the card with Rayna's name rested under the tree.", "Exact cozy-c-sounds path: cat, card, tree");
add("story_cozy_end_cat_card_house", "Cat and the card with Rayna's name rested beside the house.", "Exact cozy-c-sounds path: cat, card, house");
add("story_cozy_end_caterpillar_cocoon_tree", "Caterpillar and the cocoon on its branch rested under the tree.", "Exact cozy-c-sounds path: caterpillar, cocoon, tree");
add("story_cozy_end_caterpillar_cocoon_house", "Caterpillar and the cocoon on its branch rested beside the house.", "Exact cozy-c-sounds path: caterpillar, cocoon, house");
add("story_cozy_end_caterpillar_card_tree", "Caterpillar and the card with Rayna's name rested under the tree.", "Exact cozy-c-sounds path: caterpillar, card, tree");
add("story_cozy_end_caterpillar_card_house", "Caterpillar and the card with Rayna's name rested beside the house.", "Exact cozy-c-sounds path: caterpillar, card, house");

export const STORY_PHRASES = Object.freeze(phrases);
export default STORY_PHRASES;
