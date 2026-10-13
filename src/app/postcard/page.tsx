import type {Metadata} from "next";
import styles from "../brand/brand.module.css";
import PostcardLogin from "./postcard-login";

export const metadata:Metadata={
 title:"BitcoinWalk Host login",
 description:"Connect the existing Nostr identity used to manage a BitcoinWalk.",
};

export default function PostcardPage(){return <main className={styles.postcardLoginPage} data-hide-site-footer><PostcardLogin/></main>}
